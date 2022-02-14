import { BinaryOperator } from './types'

export function mathEval(
  lhs: number,
  operator: BinaryOperator,
  rhs: number
): number {
  switch (operator) {
    case '+':
      return lhs + rhs
    case '*':
      return lhs * rhs
    case '-':
      return lhs - rhs
    case '/':
      return lhs / rhs
    default:
      return lhs
  }
}
