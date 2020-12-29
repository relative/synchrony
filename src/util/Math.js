module.exports = function math(left, operator, right) {
  switch (operator) {
    case '+':
      return left + right
    case '*':
      return left * right
    case '-':
      return left - right
    case '/':
      return left / right
  }
  return left
}
