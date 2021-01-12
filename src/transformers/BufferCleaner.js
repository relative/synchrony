const Transformer = require('./Transformer'),
  walk = require('acorn-walk')

const WHITELISTED_FROMS = ['base64']
const WHITELISTED_PROPS = ['toString']

module.exports = class BufferCleanerTransformer extends (
  Transformer
) {
  constructor(params) {
    super('BufferCleanerTransformer', 'magenta', params)
  }

  async run(ast) {
    const log = this.log.bind(this)

    walk.simple(ast, {
      CallExpression(call) {
        if (!call.callee || call.callee.type !== 'MemberExpression') return
        let mem = call.callee
        if (!mem.object || mem.object.type !== 'NewExpression') return
        let calleeClass = mem.object.callee
        if (
          !calleeClass ||
          calleeClass.type !== 'Identifier' ||
          calleeClass.name !== 'Buffer'
        )
          return
        let newe = mem.object
        if (!newe.arguments || newe.arguments.length !== 2) return
        let str = newe.arguments[0]
        let from = newe.arguments[1]
        if (str.type !== 'Literal' || from.type !== 'Literal') return
        if (!mem.property || mem.property.type !== 'Literal') return
        let prop = mem.property.value
        str = str.value
        from = from.value
        if (
          !call.arguments ||
          call.arguments.length !== 1 ||
          call.arguments[0].type !== 'Literal'
        )
          return
        let format = call.arguments[0].value

        if (!WHITELISTED_FROMS.includes(from)) return
        if (!WHITELISTED_PROPS.includes(prop)) return

        let dec = Buffer.from(str, from)[prop](format)
        call.type = 'Literal'
        call.value = dec
        log(
          `Decoded new Buffer('${str}', '${from}').toString('${format}') => '${dec}'`
        )
      },
    })

    return ast
  }
}
