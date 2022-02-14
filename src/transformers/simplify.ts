import {
  Program,
  NumericLiteral,
  Literal,
  sp,
  UnaryExpression,
  NumericUnaryExpression,
} from '../util/types'
import Transformer from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'

import { unaryExpressionToNumber } from '../util/translator'
import { mathEval } from '../util/math'

import Context from '../context'
import { Node } from 'estree'

export interface SimplifyOptions {}
export default class Simplify extends Transformer<SimplifyOptions> {
  constructor(options: SimplifyOptions) {
    super('Simplify', options)
  }

  // incase other opers like shft/xor are found in code
  private ALLOWED_MATH_OPERS = ['+', '-', '*', '/']

  negativeString(ast: Program) {
    walk(ast, {
      UnaryExpression(node) {
        if (
          node.argument.type === 'Literal' &&
          typeof node.argument.value === 'string' &&
          node.argument.value.startsWith('0x') &&
          node.operator === '-'
        ) {
          return {
            type: 'Literal',
            value: unaryExpressionToNumber(node, true),
            operator: undefined,
            prefix: undefined,
          }
        }
      },
    })
    return this
  }

  stringConcat(ast: Program) {
    walk(ast, {
      BinaryExpression(node) {
        if (
          Guard.isLiteralString(node.left) &&
          Guard.isLiteralString(node.right)
        ) {
          return {
            type: 'Literal',
            value: node.left.value + node.right.value,
          }
        }
      },
    })
    return this
  }

  math(ast: Node) {
    const { ALLOWED_MATH_OPERS } = this
    walk(ast, {
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
  truthyFalsy(ast: Node) {
    walk(ast, {
      UnaryExpression(node) {
        if (node.operator !== '!') return
        if (!Guard.isLiteralNumeric(node.argument)) return
        if (![0, 1].includes(node.argument.value)) return
        sp<Literal>(node, {
          type: 'Literal',
          value: !node.argument.value,
        })
      },
    })
    return this
  }

  fixup(ast: Node) {
    // convert negative numlits to UnaryExpressions
    // negative numlits cause error on codegen
    walk(ast, {
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
    this.negativeString(context.ast)
      .stringConcat(context.ast)
      .math(context.ast)
      .truthyFalsy(context.ast)
      .fixup(context.ast)
  }
}
