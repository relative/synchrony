import { UnaryExpression, Literal } from './types'
import * as Guard from './guard'

export function unaryExpressionToNumber(
  node: UnaryExpression,
  pi: boolean = false
): number {
  if (node.argument.type !== 'Literal')
    throw new TypeError('UnaryExpression argument is not Literal')
  if (typeof node.argument.value !== 'number' && !pi)
    throw new TypeError('UnaryExpression argument value is not number')

  let num = pi
    ? parseInt(node.argument.value as string)
    : (node.argument.value as number)
  if (node.operator === '-') num = num * -1
  return num
}

export function literalOrUnaryExpressionToNumber(
  node: Literal | UnaryExpression,
  pi: boolean = false
): number {
  if (Guard.isLiteralNumeric(node)) {
    return node.value
  } else if (Guard.isLiteralString(node) && pi) {
    return parseInt(node.value)
  } else if (Guard.isUnaryExpression(node)) {
    return unaryExpressionToNumber(node, pi)
  }
  throw new TypeError("Couldn't translate node to Number")
}
