const Transformer = require('./Transformer'),
  walk = require('acorn-walk')

const { unaryExpressionToNumber } = require('../util/Translator'),
  math = require('../util/Math')

module.exports = class ControlFlowTransformer extends (
  Transformer
) {
  constructor(params) {
    super('ControlFlowTransformer', 'magenta', params)
  }

  async run(ast) {
    const log = this.log.bind(this)
    // reverses https://github.com/javascript-obfuscator/javascript-obfuscator#controlflowflattening into readable code

    walk.simple(ast, {
      FunctionDeclaration(node) {
        let map = {}

        walk.simple(node, {
          VariableDeclarator(decl) {
            if (!decl.init || decl.init.type !== 'ObjectExpression') return
            map[decl.id.name] = map[decl.id.name] || {}
            decl.init.properties.forEach((prop) => {
              if (prop.key.type !== 'Literal') return
              if (prop.value.type !== 'FunctionExpression') return
              if (prop.value.body.type !== 'BlockStatement') return

              let body = prop.value.body
              if (body.body.length !== 1) return
              if (body.body[0].type !== 'ReturnStatement') return
              map[decl.id.name][prop.key.value] = prop.value
            })
          },
        })

        // Decode membexp
        walk.simple(node, {
          CallExpression(call) {
            if (call.callee.type !== 'MemberExpression') return
            let exp = call.callee
            if (exp.object.type !== 'Identifier') return
            if (exp.property.type !== 'Literal') return

            let mapObj = map[exp.object.name]
            if (!mapObj) return

            let fn = mapObj[exp.property.value]
            if (typeof fn === 'undefined') return
            fn = { ...fn }
            let ret = fn.body.body[0]

            let argMap = {}
            call.arguments.forEach((arg, idx) => {
              let matchingParam = fn.params[idx]
              if (!matchingParam) return
              argMap[matchingParam.name] = arg
            })

            let ob = ret.argument
            walk.simple(ob, {
              Identifier(ident) {
                if (!argMap[ident.name]) return
                Object.assign(ident, argMap[ident.name])
              },
            })

            Object.assign(call, ob)
            log(`Replaced call to ${exp.object.name}[${exp.property.value}]`)
            /*exp.type = 'Literal'
            exp.value = val
            log(`Decoded ${exp.object.name}[${exp.property.value}] =>`, val)*/
          },
        })
      },
    })

    return ast
  }
}
