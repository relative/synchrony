const Transformer = require('./Transformer'),
  walk = require('acorn-walk')

const ESCAPE_SEQ_REGEX = /^'(\\x[0-9a-f]{2,2})+'$/gi // ast .raw prop lit

module.exports = class StringArrayTransformer extends Transformer {
  constructor(params) {
    super('StringArrayTransformer', 'red', params)
    this.identifiers = params.identifiers || []
    this.removeArrays =
      typeof params.removeArrays === 'undefined' ? false : params.removeArrays
    this.findIdentifiers = params.findIdentifiers ?? false
    this.findIdentifiers_onlyEscapeSeqsOnStr =
      params.findIdentifiers_onlyEscapeSeqsOnStr ?? true // On by default, only
    // finds arrays with \x00\x00\x00 strlits in them, or strlits with \ns in
    // them
  }

  async run(ast) {
    const log = this.log.bind(this)
    const findIdentifiers = this.findIdentifiers
    const findIdentifiers_onlyEscapeSeqsOnStr =
      this.findIdentifiers_onlyEscapeSeqsOnStr
    const removeArrays = this.removeArrays
    const identifiers = this.identifiers
    let arrays = {}

    walk.simple(ast, {
      VariableDeclarator(node) {
        if (!node.id || node.id.type !== 'Identifier') return
        if (!node.init || node.init.type !== 'ArrayExpression') return
        let idName = node.id.name
        if (!identifiers.includes(idName) && !findIdentifiers) return
        if (arrays[idName]) {
          // identifier name overlap
          log(`Found duplicate array with ident ${idName}`)
          return
        }
        let elements = node.init.elements
        if (
          elements.some(
            (e) => e.type !== 'Literal' /*|| typeof e.value !== 'string'*/
          )
        )
          return

        if (findIdentifiers_onlyEscapeSeqsOnStr) {
          if (
            elements.some(
              (e) =>
                typeof e.value === 'string' &&
                !e.raw.match(ESCAPE_SEQ_REGEX) &&
                !e.raw.match('\\\\n')
            )
          ) {
            // todo! remove
            log(`ident ${idName} had a string not matching escape seq or nl`)
            return
          }
        }

        arrays[idName] = elements.map((e) => e.value)
        //log(`ident ${idName} found with ${elements.length} strings`)
      },
    })

    walk.simple(ast, {
      MemberExpression(node) {
        if (!node.object || node.object.type !== 'Identifier') return
        if (
          !node.property ||
          node.property.type !== 'Literal' ||
          typeof node.property.value !== 'number'
        )
          return // Only look at object[number] memberexpressions
        if (!arrays[node.object.name]) return // Not a found identifier
        if (node.property.value >= arrays[node.object.name].length) {
          return // Value too high for array
        }
        node.type = 'Literal'
        node.value = arrays[node.object.name][node.property.value]
        /*log(
          `Changed ${node.object.name}[${node.property.value}] => ${node.value}`
        )*/
        return
      },
    })

    return ast
  }
}
