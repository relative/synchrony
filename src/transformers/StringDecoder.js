const Transformer = require('./Transformer'),
  walk = require('acorn-walk')

const { CleanArgumentsArray } = require('../util/Translator')

const IDX_IDENT = 0,
  IDX_OFFSET = 1,
  IDX_FN = 2,
  IDX_TYPE = 3,
  IDX_OFFSETS = 4,
  IDX_SCANNER = 5

const TYPE_ONE = 0,
  TYPE_TWO = 1,
  TYPE_THREE = 2,
  TYPE_FOUR = 3 // Passthru.

const OFFSET_INDEX = 0,
  ID_INDEX = 1

function findIdentifierNameInNode(node) {
  if (node.type === 'Identifier') return node.name

  if (node.type === 'BinaryExpression') {
    if (node.left.type === 'Identifier')
      return findIdentifierNameInNode(node.left)
    if (node.right.type === 'Identifier')
      return findIdentifierNameInNode(node.right)
  }
  return // open an issue if it doesn't find the identifiers please
}

function getConsFromNode(node) {
  if (node.type === 'Literal') {
    offset = parseInt(node.value)
  } else if (node.type === 'UnaryExpression') {
    if (node.operator === '-') {
      offset = -1 * parseInt(node.argument.value)
    }
  } else if (node.type === 'BinaryExpression') {
    let consequences = [node.left, node.right].filter(
      (i) => i.type === 'Literal' || i.type === 'UnaryExpression'
    )
    if (!consequences || consequences.length === 0) return
    for (let consequence of consequences) {
      switch (consequence.type) {
        case 'UnaryExpression':
          if (consequence.operator !== '-') return
          if (!consequence.prefix) return
          if (consequence.argument.type !== 'Literal') return
          return consequence.argument.value * -1
        case 'Literal':
        default:
          return consequence.value
      }
    }
  } else {
    console.log(require('util').inspect(node, false, 1000, true))
    return
  }
}

module.exports = class StringDecoderTransformer extends Transformer {
  constructor(params) {
    super('StringDecoderTransformer', 'red', params)
    this.identifiers = params.identifiers
    this.arrays = params.arrays
    this.findStringArrays = params.findStringArrays
    this.removeReferences =
      typeof params.removeReferences === 'undefined'
        ? false
        : params.removeReferences
    this.indexFinder =
      typeof params.indexFinder === 'undefined' ? false : params.indexFinder
  }

  async run(ast) {
    const log = this.log.bind(this)
    const removeReferences = this.removeReferences
    const indexFinder = this.indexFinder

    if (this.findStringArrays) {
      let arrays = []
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

    if (this.arrays) {
      this.arrays.forEach(([name, arr]) => {
        walk.simple(ast, {
          MemberExpression(node) {
            if (node.object.type !== 'Identifier' || node.object.name !== name)
              return
            if (node.property.type !== 'Literal') return

            node.type = 'Literal'
            node.value = arr[node.property.value]
          },
        })
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
    walk.ancestor(ast, {
      VariableDeclarator(node, ancestors) {
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
        if (!identifiers.find((i) => i[IDX_IDENT] === call.callee.name)) {
          log('Failed', call.callee.name)
          return
        }

        let parent = identifiers.find((i) => i[IDX_IDENT] === call.callee.name)

        let varIdent = node.id.name
        let offset = 0
        let argu = call.arguments[0]
        /*let fnType =
          call.arguments[0].type === 'BinaryExpression' ? TYPE_ONE : TYPE_TWO*/

        let fnType = TYPE_ONE

        if (argu.type === 'Identifier') {
          //fnType = TYPE_TWO
          argu = call.arguments[1]
        }

        let offsetIndex = 0,
          idIndex = 1

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
        if (parent[IDX_SCANNER]) {
          let parentOffsets = parent[IDX_OFFSETS]
          let params = [
            call.arguments[parentOffsets[0]], // offset
            call.arguments[parentOffsets[1]], // index
          ]

          let paramIdNodes = params.map(findIdentifierNameInNode)

          log(`${varIdent} scanned to`, paramIdNodes[0], paramIdNodes[1])
          if (paramIdNodes.some((i) => typeof i === 'undefined'))
            return log(`${varIdent} cancelled, scanned wrong`)
          offsetIndex = fn.params.findIndex(
            (param) => param.name === paramIdNodes[0]
          )
          idIndex = fn.params.findIndex(
            (param) => param.name === paramIdNodes[1]
          )
          log('? getConsFromNode')
          offset = getConsFromNode(call.arguments[offsetIndex])
        } else {
          offsetIndex = fn.params.findIndex(
            (param) => param.name === argu.left.name
          )
          idIndex = fn.params.findIndex(
            (param) =>
              param.name ===
              call.arguments[
                call.arguments[0].type === 'BinaryExpression' ? 1 : 0
              ].name
          )
        }
        log('VV current offset=', offset)
        offset = (parent[IDX_OFFSET] || 0) - offset

        identifiers.push([
          varIdent,
          offset,
          parent[IDX_FN],
          fnType,
          [offsetIndex, idIndex],
          true,
        ])
        log(
          'Pushing',
          varIdent,
          offsetIndex,
          idIndex,
          'parent=',
          parent[IDX_IDENT],
          'offset=',
          offset,
          'parentOffset=',
          parent[IDX_OFFSET]
        )
        node.ref = true
        if (removeReferences)
          ancestors.forEach((anc) => {
            if (anc.type !== 'VariableDeclaration') return
            anc.declarations = anc.declarations.filter((item) => !item.ref)
            if (anc.declarations.length === 0) anc.type = 'EmptyStatement'
          })
      },
    })

    // Get var refs.
    walk.ancestor(ast, {
      VariableDeclarator(node, ancestors) {
        if (!node.id || node.id.type !== 'Identifier') return
        if (!node.init || node.init.type !== 'Identifier') return
        let parent = identifiers.find((i) => i[IDX_IDENT] === node.init.name)
        if (!parent) return
        identifiers.push([
          node.id.name,
          parent[IDX_OFFSET],
          parent[IDX_FN],
          parent[IDX_TYPE],
          parent[IDX_OFFSETS],
        ])
        node.ref = true

        if (removeReferences)
          ancestors.forEach((anc) => {
            if (anc.type !== 'VariableDeclaration') return
            anc.declarations = anc.declarations.filter((item) => !item.ref)
            if (anc.declarations.length === 0) anc.type = 'EmptyStatement'
          })
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
        let args = call.arguments.map((a) => {
          if (
            a &&
            a.type === 'UnaryExpression' &&
            a.operator === '-' &&
            a.argument.type === 'Literal' &&
            typeof a.argument.value === 'number'
          ) {
            a.value = a.argument.value * -1
          }
          return a
        })
        args = args.map((i) => i.value)

        if (args.some((i) => typeof i === 'undefined')) return

        let ident = args[decNode[IDX_OFFSETS][ID_INDEX]],
          offset =
            parseInt(args[decNode[IDX_OFFSETS][OFFSET_INDEX]]) +
            decNode[IDX_OFFSET]
        if (call.callee.name === '_0x363f7a') {
          log(`ID_INDEX = ${decNode[IDX_OFFSETS][ID_INDEX]}`)
          log(`OFFSET_INDEX = ${decNode[IDX_OFFSETS][OFFSET_INDEX]}`)
          log(`offset ${args[decNode[IDX_OFFSETS][OFFSET_INDEX]]}`)
          log(`${call.callee.name}(${offset}, ${ident})`)
          log('-->> end op <<--')
        }
        //log(`${call.callee.name}(${offset}, ${ident})`)
        let str = decNode[IDX_FN](offset, ident)

        log(`Decoded ${call.callee.name}(${offset}, ${ident}) => ${str}`)
        call.type = 'Literal'
        call.value = str
      },
    })

    return ast
  }
}
