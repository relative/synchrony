const Transformer = require('./Transformer'),
  walk = require('acorn-walk')

const { CleanArgumentsArray } = require('../util/Translator')

const IDX_IDENT = 0,
  IDX_OFFSET = 1,
  IDX_FN = 2,
  IDX_TYPE = 3

const TYPE_ONE = 0,
  TYPE_TWO = 1,
  TYPE_THREE = 2,
  TYPE_FOUR = 3 // Passthru.

module.exports = class StringDecoderTransformer extends (
  Transformer
) {
  constructor(params) {
    super('StringDecoderTransformer', 'red', params)
    this.identifiers = params.identifiers
    this.findStringArrays = params.findStringArrays
  }

  async run(ast) {
    const log = this.log.bind(this)
    if (this.findStringArrays) {
      walk.ancestor(ast, {
        CallExpression(node, ancestors) {
          let callExp = node
          if (callExp.arguments.length !== 2) return // [stringArray, breakCond]
          if (callExp.arguments[0].type !== 'Identifier') return // stringArray
          if (callExp.arguments[1].type !== 'Literal') return // breakCond

          let stringArray = callExp.arguments[0].name
          let breakCond = callExp.arguments[1].value
          if (typeof breakCond !== 'number') return
          log('Found possible stringArray identifier', stringArray, breakCond)
        },
      })
    }

    /*const stringArrays = ['_0x296b']

    walk.ancestor(ast, {
      CallExpression(node, ancestors) {
        let callExp = node
        if (callExp.arguments.length !== 2) return // [stringArray, breakCond]
        if (callExp.arguments[0].type !== 'Identifier') return // stringArray
        if (callExp.arguments[1].type !== 'Literal') return // breakCond

        let stringArray = callExp.arguments[0].name
        let breakCond = callExp.arguments[1].value

        if (!stringArrays.includes(stringArray)) return // invalid string array ident.
        log(stringArray, breakCond)
      },
    })
    return ast*/
    //const identifiers = [['_0x19c7f6', 0, _0x2e2a, TYPE_THREE]]
    const identifiers = this.identifiers
    walk.simple(ast, {
      VariableDeclarator(node) {
        if (!node.init) return
        if (node.init.type !== 'FunctionExpression') return // not a string dec
        let fn = node.init
        let params = fn.params.map((ident) => ident.name)
        if (!fn.body) return
        if (fn.body.type !== 'BlockStatement') return
        if (fn.body.body.length !== 1) return
        if (fn.body.body[0].type !== 'ReturnStatement') return

        let ret = fn.body.body[0]
        if (!ret.argument) return
        if (ret.argument.type !== 'CallExpression') return
        let call = ret.argument
        if (!identifiers.find((i) => i[IDX_IDENT] === call.callee.name)) return

        let parent = identifiers.find((i) => i[IDX_IDENT] === call.callee.name)

        let varIdent = node.id.name
        let offset = 0
        let argu = call.arguments[0]
        let fnType = TYPE_ONE
        if (argu.type === 'Identifier') {
          //fnType = TYPE_TWO
          argu = call.arguments[1]
        }
        if (argu.type !== 'BinaryExpression') return
        if (argu.left.type === 'Identifier' && argu.left.name === params[1])
          fnType = TYPE_TWO
        if (argu.right.type === 'Literal') {
          offset = parseInt(argu.right.value)
        } else if (argu.right.type === 'UnaryExpression') {
          if (argu.right.operator === '-') {
            offset = -1 * parseInt(argu.right.argument.value)
          }
        } else {
          return
        }

        offset = parent[IDX_OFFSET] - offset

        identifiers.push([varIdent, offset, parent[IDX_FN], fnType])
      },
    })

    // Get var refs.
    walk.simple(ast, {
      VariableDeclarator(node) {
        if (!node.id || node.id.type !== 'Identifier') return
        if (!node.init || node.init.type !== 'Identifier') return
        let parent = identifiers.find((i) => i[IDX_IDENT] === node.init.name)
        if (!parent) return
        identifiers.push([
          node.id.name,
          parent[IDX_OFFSET],
          parent[IDX_FN],
          parent[IDX_TYPE],
        ])
      },
    })

    walk.simple(ast, {
      CallExpression(call) {
        /*if (!node.expression) return
        if (node.expression.type !== 'CallExpression') return
        let call = node.expression
        if (call.callee.type !== 'Identifier') return
    
        let decNode = identifiers.find((i) => i[IDX_IDENT] === call.callee.name)
        console.log(decNode)*/

        if (call.callee.type !== 'Identifier') return

        let decNode = identifiers.find((i) => i[IDX_IDENT] === call.callee.name)
        if (!decNode) return

        if (decNode[IDX_TYPE] === TYPE_FOUR) {
          // passthru
          let args = CleanArgumentsArray(call.arguments)
          if (args.some((i) => typeof i === 'undefined')) return
          let str = decNode[IDX_FN].apply(this, args)
          log(
            `Decoded passthru ${call.callee.name}(${args.join(',')}) => ${str}`
          )
          call.type = 'Literal'
          call.value = str
          return
        }

        let args = call.arguments.map((i) => i.value)

        if (args.some((i) => typeof i === 'undefined')) return

        if (decNode[IDX_TYPE] === TYPE_TWO) {
          // reverse the args lol
          args[1] = parseInt(args[1]) + decNode[IDX_OFFSET]
          args = args.reverse()
        } else {
          args[0] = parseInt(args[0]) + decNode[IDX_OFFSET]
        }

        let str = decNode[IDX_FN](args[0], args[1])

        log(`Decoded ${call.callee.name}(${args[0]}, ${args[1]}) => ${str}`)
        call.type = 'Literal'
        call.value = str
      },
    })

    return ast
  }
}
