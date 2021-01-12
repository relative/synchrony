module.exports = {
  unaryExpressionToNumber(node, pi = false) {
    let num = node.argument.value
    if (pi) num = parseInt(num)
    if (node.operator === '-') num = num * -1
    return num
  },
}
