module.exports = {
  unaryExpressionToNumber(node) {
    let num = node.argument.value
    if (node.operator === '-') num = num * -1
    return num
  },
}
