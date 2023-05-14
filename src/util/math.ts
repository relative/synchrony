export function mathEval(lhs: number, operator: '+' | '*' | '-' | '/', rhs: number): number {
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
      throw new TypeError('Could not math eval')
  }
}
