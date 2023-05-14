import { NodePath } from '@babel/traverse'
import * as t from '~/types'

export type NodeOrPath<T extends t.Node> = NodePath<T> | T
export function getNodeFromUnion<T extends t.Node>(p: NodeOrPath<T>): T {
  return p instanceof NodePath ? p.node : p
}

export function unaryExpressionToNumber(p: NodeOrPath<t.UnaryExpression>, shouldParseInt = false): number {
  const node = getNodeFromUnion(p)
  const arg = node.argument
  let num = 0
  if (shouldParseInt) {
    if (!t.isStringLiteral(arg) && !t.isNumericLiteral(arg))
      throw new TypeError('UnaryExpression argument is not StringLiteral or NumericLiteral')
    num = parseInt(arg.value.toString())
  } else {
    if (!t.isNumericLiteral(arg)) throw new TypeError('UnaryExpression argument is not a NumericLiteral')
    num = arg.value
  }
  if (node.operator === '-') num = -num
  return num
}

export function literalOrUnaryExpressionToNumber(
  p: NodeOrPath<t.Literal> | NodeOrPath<t.UnaryExpression>,
  shouldParseInt = false
): number {
  const node = getNodeFromUnion(p)

  if (t.isNumericLiteral(node)) {
    return node.value
  } else if (t.isStringLiteral(node) && shouldParseInt) {
    return parseInt(node.value)
  } else if (t.isUnaryExpression(node)) {
    return unaryExpressionToNumber(node, shouldParseInt)
  }
  throw new TypeError("Couldn't translate node to Number")
}

export function createNumericLiteral(value: number): t.NumericLiteral | t.UnaryExpression {
  const lit = t.numericLiteral(Math.abs(value))
  return value < 0 ? t.unaryExpression('-', lit) : lit
}

export function createLiteral(
  value: any
): t.BigIntLiteral | t.NumericLiteral | t.StringLiteral | t.BooleanLiteral | false {
  switch (typeof value) {
    case 'bigint':
      return t.bigIntLiteral(value.toString())
    case 'number':
      return t.numericLiteral(value)
    case 'string':
      return t.stringLiteral(value)
    case 'boolean':
      return t.booleanLiteral(value)
    default:
      return false
  }
}
export function getValueOfNode(p: NodeOrPath<t.StringLiteral>): string
export function getValueOfNode(p: NodeOrPath<t.BooleanLiteral>): boolean
export function getValueOfNode(p: NodeOrPath<t.NumericLiteral | t.UnaryExpression>): number
export function getValueOfNode(p: NodeOrPath<t.Node>): string | boolean | number | null
export function getValueOfNode(p: NodeOrPath<t.Node>): string | boolean | number | null {
  const node = getNodeFromUnion(p)
  switch (node.type) {
    case 'StringLiteral':
      return node.value
    case 'NumericLiteral':
    case 'UnaryExpression':
      return literalOrUnaryExpressionToNumber(node)
    case 'BooleanLiteral':
      return node.value
    default:
      return null
  }
}

export function toStatement(node: t.Expression): t.Statement {
  const stmt = t.toStatement(node, true)
  if (!stmt) {
    return t.expressionStatement(node)
    // throw CantSolveStatements
  }
  return stmt
}
