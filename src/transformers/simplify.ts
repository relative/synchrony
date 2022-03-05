import {
  NumericLiteral,
  Literal,
  sp,
  NumericUnaryExpression,
  BinaryOperator,
  Node,
  Identifier,
  BlockStatement,
} from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'

import { unaryExpressionToNumber } from '../util/translator'
import { mathEval } from '../util/math'

import Context from '../context'
import { immutate } from '../util/helpers'

export interface SimplifyOptions extends TransformerOptions {}
export default class Simplify extends Transformer<SimplifyOptions> {
  constructor(options: Partial<SimplifyOptions>) {
    super('Simplify', options)
  }

  // incase other opers like shft/xor are found in code
  private ALLOWED_MATH_OPERS = ['+', '-', '*', '/']

  private ALLOWED_COMPARISON_OPERS = [
    '==',
    '===',
    '!=',
    '!==',
    '>',
    '<',
    '<=',
    '>=',
  ]

  negativeString(context: Context) {
    walk(context.ast, {
      UnaryExpression(node) {
        if (
          node.argument.type === 'Literal' &&
          typeof node.argument.value === 'string' &&
          node.argument.value.startsWith('0x') &&
          node.operator === '-'
        ) {
          sp<Literal>(node, {
            type: 'Literal',
            value: unaryExpressionToNumber(node, true),
          })
        }
      },
    })
    return this
  }

  // TODO: global method > helpers.ts
  binEval(
    lhs: string | number,
    operator: BinaryOperator,
    rhs: string | number
  ): boolean {
    switch (operator) {
      case '==':
        return lhs == rhs
      case '===':
        return lhs === rhs
      case '!=':
        return lhs != rhs
      case '!==':
        return lhs !== rhs
      case '>':
        return lhs > rhs
      case '<':
        return lhs < rhs
      case '<=':
        return lhs <= rhs
      case '>=':
        return lhs >= rhs
    }
    throw new TypeError(`Operator ${operator} is invalid`)
  }

  stringConcat(context: Context) {
    walk(context.ast, {
      BinaryExpression(node) {
        if (
          Guard.isLiteralString(node.left) &&
          Guard.isLiteralString(node.right) &&
          node.operator === '+'
        ) {
          sp<Literal>(node, {
            type: 'Literal',
            value: node.left.value + node.right.value,
          })
        }
      },
    })
    return this
  }

  // This is used in stringdecoder for the push/shift iife
  math(_node: Node) {
    const { ALLOWED_MATH_OPERS } = this
    walk(_node, {
      BinaryExpression(node) {
        // unex & number
        if (!ALLOWED_MATH_OPERS.includes(node.operator)) return
        if (Guard.isUnaryExpressionNumeric(node.left)) {
          sp<NumericLiteral>(node.left, {
            type: 'Literal',
            value: unaryExpressionToNumber(node.left),
          })
        }

        if (Guard.isUnaryExpressionNumeric(node.right)) {
          sp<NumericLiteral>(node.right, {
            type: 'Literal',
            value: unaryExpressionToNumber(node.right),
          })
        }

        if (
          Guard.isLiteralNumeric(node.left) &&
          Guard.isLiteralNumeric(node.right)
        ) {
          const val = mathEval(node.left.value, node.operator, node.right.value)
          if (isNaN(val)) {
            // will throw error on codegen, ignore
            return
          }
          sp<NumericLiteral>(node, {
            type: 'Literal',
            value: val,
          })
        }
      },
    })
    return this
  }

  // !0/true, !1/false
  // ![]/false
  truthyFalsy(context: Context) {
    walk(context.ast, {
      UnaryExpression(node) {
        if (node.operator !== '!') return
        if (!Guard.isArrayExpression(node.argument)) return
        if (node.argument.elements.length !== 0) return

        sp<Literal>(node, {
          type: 'Literal',
          value: false,
        })
      },
    })

    walk(context.ast, {
      UnaryExpression(node) {
        if (node.operator !== '!') return
        if (Guard.isLiteralBoolean(node.argument)) {
          return sp<Literal>(node, {
            type: 'Literal',
            value: !node.argument.value,
          })
        } else if (Guard.isLiteralNumeric(node.argument)) {
          if (![0, 1].includes(node.argument.value)) return
          sp<Literal>(node, {
            type: 'Literal',
            value: !node.argument.value,
          })
        }
      },
    })
    return this
  }

  literalComparison(context: Context) {
    const { ALLOWED_COMPARISON_OPERS, binEval } = this
    walk(context.ast, {
      BinaryExpression(node) {
        if (
          !Guard.isLiteralNumeric(node.left) &&
          !Guard.isLiteralString(node.left)
        )
          return

        if (
          !Guard.isLiteralNumeric(node.right) &&
          !Guard.isLiteralString(node.right)
        )
          return

        if (!ALLOWED_COMPARISON_OPERS.includes(node.operator)) return

        let res = binEval(node.left.value, node.operator, node.right.value)
        sp<Literal>(node, {
          type: 'Literal',
          value: res,
        })
      },
    })
    return this
  }

  singleToBlock(context: Context) {
    walk(context.ast, {
      ForStatement(node) {
        if (Guard.isBlockStatement(node.body)) return
        sp<BlockStatement>(node.body, {
          type: 'BlockStatement',
          body: [immutate(node.body)],
        })
      },
      WhileStatement(node) {
        if (Guard.isBlockStatement(node.body)) return
        sp<BlockStatement>(node.body, {
          type: 'BlockStatement',
          body: [immutate(node.body)],
        })
      },
      IfStatement(node) {
        if (!Guard.isBlockStatement(node.consequent)) {
          sp<BlockStatement>(node.consequent, {
            type: 'BlockStatement',
            body: [immutate(node.consequent)],
          })
        }
        if (node.alternate && !Guard.isBlockStatement(node.alternate)) {
          sp<BlockStatement>(node.alternate, {
            type: 'BlockStatement',
            body: [immutate(node.alternate)],
          })
        }
      },
    })
    return this
  }

  conditionalExpression(context: Context) {
    walk(context.ast, {
      ConditionalExpression(node, _, ancestors) {
        if (!Guard.isLiteralBoolean(node.test)) return
        if (!node.test.value) {
          node.test.value = true
          let consequent = node.consequent
          node.consequent = node.alternate
          node.alternate = consequent
        }

        // node.test.value is true now
        // alternate will be invalid branch
        sp<Identifier>(node.alternate, {
          type: 'Identifier',
          name: 'undefined',
        })

        sp<Node>(node, node.consequent)
      },
    })
    return this
  }

  fixup(context: Context) {
    // convert negative numlits to UnaryExpressions
    // negative numlits cause error on codegen
    walk(context.ast, {
      Literal(node) {
        if (!Guard.isLiteralNumeric(node)) return
        if (node.value >= 0) return
        sp<NumericUnaryExpression>(node, {
          type: 'UnaryExpression',
          operator: '-',
          prefix: true,
          argument: { type: 'Literal', value: Math.abs(node.value) } as any,
        })
      },
    })
    return this
  }

  public async transform(context: Context) {
    this.negativeString(context)
      .stringConcat(context)
      .math(context.ast)
      .truthyFalsy(context)
      .literalComparison(context)
      .conditionalExpression(context)
      .singleToBlock(context)
      .fixup(context)
  }
}
