const Transformer = require('./Transformer'),
  walk = require('acorn-walk')

module.exports = class MemberExpressionCleanerTransformer extends (
  Transformer
) {
  constructor(params) {
    super('MemberExpressionCleaner', 'blue', params)
  }

  async run(ast) {
    const log = this.log.bind(this)

    walk.simple(ast, {
      MemberExpression(node) {
        if (node.object.type !== 'Identifier') return
        if (node.property.type !== 'Literal') return
        if (typeof node.property.value !== 'string') return
        if (!node.property.value.match(/^[a-z][\w]*$/i)) return

        node.computed = false
        node.property.type = 'Identifer'
        node.property.name = node.property.value

        log(
          `Converted ${node.object.name}[${node.property.value}]`,
          '=>',
          `${node.object.name}.${node.property.value}`
        )
      },
    })
  }
}
