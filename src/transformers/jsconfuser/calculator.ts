import {
  sp,
  Property,
  Literal,
  Function,
  ArrowFunctionExpression,
  FunctionExpression,
  FunctionDeclaration,
  Identifier,
  VariableDeclarator,
  VariableDeclaration,
  BinaryExpression,
  ReturnStatement,
  Expression,
} from '../../util/types'
import { Transformer, TransformerOptions } from './../transformer'
import { walk, findNodeAt } from '../../util/walk'
import * as Guard from '../../util/guard'
import Context from '../../context'
import { filterEmptyStatements } from '../../util/helpers'
import { literalOrUnaryExpressionToNumber } from '../../util/translator'

const ALLOWED_OPERATORS = ['+', '-', '*', '/']
type AllowedOperator = '+' | '-' | '*' | '/'
interface Operator {
  test: number
  operator: AllowedOperator
  lhsIndex: number
  rhsIndex: number
}

interface CalcFunction {
  identifier: string
  operators: Operator[]
  operIndex: number
}

export interface JSCCalculatorOptions extends TransformerOptions {}
export default class JSCCalculator extends Transformer<JSCCalculatorOptions> {
  functions: CalcFunction[] = []
  constructor(options: Partial<JSCCalculatorOptions>) {
    super('JSCCalculator', options)
  }

  find(context: Context) {
    const { functions } = this
    function visitor(node: FunctionDeclaration | FunctionExpression) {
      let body = filterEmptyStatements(node.body.body)
      if (body.length !== 1) return
      if (!Guard.isSwitchStatement(body[0])) return
      if (!node.id || !Guard.isIdentifier(node.id)) return
      const fnName = node.id.name
      const ss = body[0]
      if (
        !ss.cases.every(
          (c) =>
            c.consequent &&
            c.consequent.length === 1 &&
            Guard.isReturnStatement(c.consequent[0]) &&
            c.consequent[0].argument &&
            Guard.isBinaryExpression(c.consequent[0].argument) &&
            Guard.isIdentifier(c.consequent[0].argument.left) &&
            Guard.isIdentifier(c.consequent[0].argument.right)
        )
      )
        return

      if (!Guard.isIdentifier(ss.discriminant)) return
      const operatorId = ss.discriminant.name

      // check for each param being an identifier breaks on spread
      const indices = node.params.map((i) => Guard.isIdentifier(i) && i.name)
      const func: CalcFunction = {
        identifier: fnName,
        operators: [],
        operIndex: indices.findIndex((i) => i === operatorId),
      }

      for (const c of ss.cases) {
        if (
          !c.test ||
          (!Guard.isLiteralNumeric(c.test) && !Guard.isUnaryExpression(c.test))
        )
          return // intended return

        let test = literalOrUnaryExpressionToNumber(c.test)
        // checked above in .every
        let binex = (c.consequent[0] as ReturnStatement)
          .argument as BinaryExpression
        if (!ALLOWED_OPERATORS.includes(binex.operator)) return // intended return
        let lhsId = (binex.left as Identifier).name,
          rhsId = (binex.right as Identifier).name
        let lhsIndex = indices.findIndex((i) => i === lhsId),
          rhsIndex = indices.findIndex((i) => i === rhsId)

        const oper: Operator = {
          test: test,
          operator: binex.operator as AllowedOperator,
          lhsIndex,
          rhsIndex,
        }
        func.operators.push(oper)
      }

      context.log(
        'Found calculator function id =',
        func.identifier,
        'oper =',
        func.operIndex,
        'opers =',
        func.operators
      )
      functions.push(func)
      //;(node as any).type = 'EmptyStatement'
    }
    walk(context.ast, {
      FunctionDeclaration: visitor,
      FunctionExpression: visitor,
    })
    return this
  }

  fix(context: Context) {
    const { functions } = this
    walk(context.ast, {
      CallExpression(cx) {
        if (!Guard.isIdentifier(cx.callee)) return
        let fnId = cx.callee.name
        let func: CalcFunction | undefined
        if (!(func = functions.find((f) => f.identifier === fnId))) return

        let _test = cx.arguments[func.operIndex]
        if (
          !Guard.isLiteralNumeric(_test) &&
          !Guard.isUnaryExpressionNumeric(_test)
        )
          return
        const test = literalOrUnaryExpressionToNumber(_test)

        const operator = func.operators.find((i) => i.test === test)
        if (!operator) return
        let lhs = cx.arguments[operator.lhsIndex] as Expression,
          rhs = cx.arguments[operator.rhsIndex] as Expression
        sp<BinaryExpression>(cx, {
          type: 'BinaryExpression',
          left: lhs,
          right: rhs,
          operator: operator.operator,
        })
      },
    })
    return this
  }

  public async transform(context: Context) {
    this.find(context).fix(context)
  }
}
