const Transformer = require('./Transformer'),
  walk = require('acorn-walk'),
  util = require('util'),
  _ = require('lodash')

const { unaryExpressionToNumber } = require('../util/Translator'),
  math = require('../util/Math')

//function deepClone(

function immutate(obj) {
  let newObj = {}
  Object.keys(obj).forEach((key) => {
    let val = obj[key]
    if (!val) return
    if (typeof val === 'object') val = immutate(val)

    newObj[key] = val
  })
  return newObj
}

function loop(obj) {
  let newObj = {}
  Object.keys(obj).forEach((key) => {
    let val = obj[key]
    if (!val) return
    if (typeof val === 'object' && !('type' in val) && !Array.isArray(val))
      val = loop(val)
    if (Array.isArray(val)) {
      val.forEach((_, idx) => {
        val[idx] = loop(_)
      })
      if (key === 'body') {
        val = val.flat()
      }
    }
    if (typeof val === 'object' && 'type' in val) {
      if (val.type === 'ExpressionStatement' && val.controlFlow_esse) {
        val = val.controlFlow_expressions
      }
    }

    newObj[key] = val
  })
  return newObj
}

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
      FunctionExpression(node) {
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
              log(
                `Mapped ${decl.id.name}[${prop.key.value}] to ${prop.value.type}`
              )
              map[decl.id.name][prop.key.value] = prop.value
            })
          },
        })

        // Parse obj[id] = function(arg, two)
        walk.simple(node, {
          AssignmentExpression(decl) {
            if (decl.right.type !== 'FunctionExpression') return

            if (decl.left.type !== 'MemberExpression') return
            if (decl.left.object.type !== 'Identifier') return
            if (decl.left.property.type !== 'Literal') return

            if (typeof map[decl.left.object.name] === 'undefined') return

            let objId = decl.left.object.name

            let fn = decl.right

            if (fn.body.type !== 'BlockStatement') return

            let body = fn.body
            if (body.body.length !== 1) return
            if (body.body[0].type !== 'ReturnStatement') return
            map[objId][decl.left.property.value] = fn

            log(`E ${objId}[${decl.left.property.value}] to a fn`)
          },
        })
        walk.simple(node, {
          VariableDeclarator(decl) {
            if (decl.init && decl.init.type === 'Identifier') {
              if (typeof map[decl.init.name] !== 'undefined') {
                log('Mapped', decl.id.name, 'to prev map', decl.init.name)
                map[decl.id.name] = decl.init.name
              }
            }
          },
        })

        Object.keys(map).forEach((key) => {
          let val = map[key]
          if (typeof val === 'string') map[key] = map[val]
        })
        let rm = new Map()

        Object.keys(map).forEach((key) => {
          let nm = new Map()
          let val = map[key]
          Object.keys(val).forEach((vk) => {
            nm.set(vk, val[vk])
          })

          rm.set(key, nm)
        })

        /*walk.make({
            SequenceExpression(node, st, c) {
              // default baseVisitors from acorn-walk do not recurse over expressions inside of a SequenceExpression... :(
              if (node.expressions)
                for (let arg of node.expressions) c(arg, st, 'Expression')
            },
          })*/
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

            //let ob = ret.argument
            let ob = immutate(
              map[exp.object.name][exp.property.value].body.body[0].argument
            )
            //let ob = rm.get(exp.object.name).get(exp.property.value).body.body[0].argument
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

    walk.simple(ast, {
      BlockStatement(node) {
        let go = false
        walk.ancestor(node, {
          ExpressionStatement(stmt, _) {
            if (stmt.expression.type !== 'SequenceExpression') return
            stmt.controlFlow_esse = true

            stmt.controlFlow_expressions = stmt.expression.expressions
            go = true
          },
          ConditionalExpression(stmt, _) {
            if (stmt.consequent.type !== 'SequenceExpression') return
            if (stmt.alternate.type !== 'SequenceExpression') return

            let cons = { ...stmt.consequent },
              alt = { ...stmt.alternate }
            stmt.type = 'IfStatement'
            stmt.consequent = {
              type: 'BlockStatement',
              body: cons.expressions,
            }
            stmt.alternate = {
              type: 'BlockStatement',
              body: alt.expressions,
            }
          },
        })
        if (go) {
          log(loop(node))
          //Object.assign(node, loop(node))
        }
      },
    })
    return ast
  }
}
