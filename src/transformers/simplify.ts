import {
  NumericLiteral,
  Literal,
  sp,
  NumericUnaryExpression,
  BinaryOperator,
  Node,
  Identifier,
  BlockStatement,
  IfStatement,
  Statement,
  Function,
  CallExpression,
} from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'

import { unaryExpressionToNumber, createLiteral } from '../util/translator'
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
          sp<any>(node, createLiteral(val))
          /*sp<NumericLiteral>(node, {
            type: 'Literal',
            value: val,
          })*/
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

  literalComparison(_node: Node) {
    const { ALLOWED_COMPARISON_OPERS, binEval } = this
    walk(_node, {
      BinaryExpression(node) {
        if (
          !Guard.isLiteralNumeric(node.left) &&
          !Guard.isUnaryExpressionNumeric(node.left) &&
          !Guard.isLiteralString(node.left)
        )
          return

        if (
          !Guard.isLiteralNumeric(node.right) &&
          !Guard.isUnaryExpressionNumeric(node.right) &&
          !Guard.isLiteralString(node.right)
        )
          return

        if (!ALLOWED_COMPARISON_OPERS.includes(node.operator)) return

        let lhs = Guard.isLiteral(node.left)
            ? node.left.value
            : unaryExpressionToNumber(node.left),
          rhs = Guard.isLiteral(node.right)
            ? node.right.value
            : unaryExpressionToNumber(node.right)

        let res = binEval(lhs, node.operator, rhs)
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

  conditionalExpression(_node: Node) {
    walk(_node, {
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

  logicalExpression(context: Context) {
    walk(context.ast, {
      ExpressionStatement(exst) {
        if (!Guard.isExpressionStatement(exst)) return
        if (!Guard.isLogicalExpression(exst.expression)) return
        if (!Guard.isBinaryExpression(exst.expression.left)) return
        if (!Guard.isSequenceExpression(exst.expression.right)) return

        const exprs = [...exst.expression.right.expressions].map((e) =>
          (e.type as string) !== 'ExpressionStatement'
            ? {
                type: 'ExpressionStatement',
                start: e.start,
                end: e.end,
                expression: e,
              }
            : e
        ) as Statement[]

        sp<IfStatement>(exst, {
          type: 'IfStatement',
          test: exst.expression.left,
          consequent: {
            type: 'BlockStatement',
            start: 0,
            end: 0,
            body: exprs,
          },
        })
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

    // fix empty VariableDeclarations
    walk(context.ast, {
      VariableDeclaration(node) {
        node.declarations = node.declarations.filter(
          (i) => !i.init || (i.init as any).type !== 'EmptyStatement'
        )
        if (node.declarations.length !== 0) return
        ;(node as any).type = 'EmptyStatement'
      },
    })
    return this
  }

  // "simplify"
  fixProxies(context: Context) {
    walk(context.ast, {
      CallExpression(cx) {
        if (
          !Guard.isFunctionExpression(cx.callee) &&
          !Guard.isArrowFunctionExpression(cx.callee)
        )
          return
        if (!Guard.isBlockStatement(cx.callee.body)) return
        if (cx.callee.body.body.length !== 1) return
        if (!Guard.isReturnStatement(cx.callee.body.body[0])) return
        const retn = cx.callee.body.body[0].argument
        if (!retn) return
        if (
          [
            'FunctionExpression',
            'ArrowFunctionExpression',
            'FunctionDeclaration',
          ].includes(retn.type)
        ) {
          sp<Function>(cx, retn as unknown as Function)
        } else if (Guard.isCallExpression(retn)) {
          // (function (a, b) {
          //   return b(a());
          // }(f, h));
          //  - to -
          // h(f())
          // potentially move this into its own transformer
          if (
            !cx.arguments.every(
              (a) => Guard.isLiteral(a) || Guard.isIdentifier(a)
            )
          )
            return
          const scope = context.scopeManager.acquire(cx.callee)
          if (!scope) return
          for (const v of scope.variables) {
            if (v.defs.length !== 1) continue
            let def = v.defs[0]
            if (def.type !== 'Parameter') continue
            let pidx = (def as any).index as number
            for (const ref of v.references) {
              sp<any>(ref.identifier, cx.arguments[pidx])
            }
          }

          sp<CallExpression>(cx, retn)
        }
      },
    })
    return this
  }

  public async transform(context: Context) {
    this.negativeString(context)
      .stringConcat(context)
      .math(context.ast)
      .truthyFalsy(context)
      .literalComparison(context.ast)
      .conditionalExpression(context.ast)
      .singleToBlock(context)
      .fixup(context)
      .logicalExpression(context)
      .fixProxies(context)
  }
}
