const Transformer = require('./Transformer'),
  walk = require('acorn-walk')

const { unaryExpressionToNumber } = require('../util/Translator'),
  math = require('../util/Math')

module.exports = class LiteralMapTransformer extends (
  Transformer
) {
  constructor(params) {
    super('LiteralMapTransformer', 'yellow', params)
  }

  async run(ast) {
    const log = this.log.bind(this)
    // Simplify negative string (number type coercion)
    walk.simple(ast, {
      FunctionDeclaration(node) {
        let map = {}

        walk.simple(node, {
          VariableDeclarator(decl) {
            if (!decl.init || decl.init.type !== 'ObjectExpression') return
            map[decl.id.name] = map[decl.id.name] || {}
            decl.init.properties.forEach((prop) => {
              if (prop.key.type !== 'Literal') return
              if (prop.value.type !== 'Literal') return
              map[decl.id.name][prop.key.value] = prop.value.value
            })
          },
        })

        // Decode membexp
        walk.simple(node, {
          MemberExpression(exp) {
            if (exp.object.type !== 'Identifier') return
            if (exp.property.type !== 'Literal') return

            let mapObj = map[exp.object.name]
            if (!mapObj) return

            let val = mapObj[exp.property.value]
            if (typeof val === 'undefined') return

            exp.type = 'Literal'
            exp.value = val
            log(`Decoded ${exp.object.name}[${exp.property.value}] =>`, val)
          },
        })
      },
    })

    return ast
  }
}
