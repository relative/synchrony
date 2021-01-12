module.exports = {
  unaryExpressionToNumber(node, pi = false) {
    let num = node.argument.value
    if (pi) num = parseInt(num)
    if (node.operator === '-') num = num * -1
    return num
  },
  CleanArgumentsArray(args) {
    let ret = []
    args.forEach((arg, idx) => {
      let val = undefined
      switch (arg.type) {
        case 'Literal':
          val = arg.value
          break
        case 'UnaryExpression':
          val = module.exports.unaryExpressionToNumber(arg)
          break
      }
      ret.push(val)
    })
    return ret
  },
}
