import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { deepIsCallExpression, deepIsReturnStatement } from 'generated:nodePathEquality'
import { ArrayMode, ae, es } from '~/util/equality'
import { allEqual } from '~/util/helpers'
import { Binding } from '@babel/traverse'
import { createLiteral, getValueOfNode } from '~/util/translator'
import { bindingIsReferenced } from '~/util/scope'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'jsconfuser/stringdecoder': z.input<typeof schema>
    }
  }
}

interface StringArray {
  identifier: string
  elements: t.StringLiteral[]
}

enum DecoderType {
  Ascii85 = 'ascii85',
  Base32 = 'base32',
  HexTable = 'hextable',
}

function decodeHexTable(str: string): string {
  let output = ''
  str = str.substring(1, str.length - 1)
  const chunks = str.split(',')
  for (let i = 0; i < chunks.length; i += 2) {
    const arr = [chunks[i], chunks[i + 1]]
    let [table, idx] = arr.map(Number)
    // console.log(table, idx);
    while (idx) {
      output += String.fromCharCode((table >> (8 * (idx & 7))) & 0xff)
      idx >>= 3
    }
  }
  return output.replace(/~/g, '')
}
function decodeBase32(str: string): string {
  let v,
    x,
    bits = 0
  let output = ''
  for (let i = 0; i < str.length; i += 1) {
    v = str.charCodeAt(i) - 33
    if (v >= 0 && v < 32) {
      // @ts-expect-error oooooooooooo
      bits += ((x = (x << 5) | v), 5)
      if (bits >= 8) {
        bits -= ((output += String.fromCharCode((x >> (bits - 8)) & 0xff)), 8)
      }
    }
  }
  return output
}

// why didn't you just write types, Michael?
/* eslint-disable */
function decodeAscii85(str: string): string {
  var c,
    d,
    e,
    f,
    g,
    w = 255

  for (
    '<~' === str.slice(0, 2) && '~>' === str.slice(-2),
      str = str.slice(2, -2).replace(/s/g, '').replace('z', '!!!!!'),
      c = 'uuuuu'.slice(str.length % 5 || 5),
      str += c,
      e = [],
      f = 0,
      g = str.length;
    g > f;
    f += 5
  )
    (d =
      52200625 * (str.charCodeAt(f) - 33) +
      614125 * (str.charCodeAt(f + 1) - 33) +
      7225 * (str.charCodeAt(f + 2) - 33) +
      85 * (str.charCodeAt(f + 3) - 33) +
      (str.charCodeAt(f + 4) - 33)),
      e.push(w & (d >> 24), w & (d >> 16), w & (d >> 8), w & d)
  return (
    (function (a, b) {
      for (var c = b; c > 0; c--) a.pop()
    })(e, c.length),
    String.fromCharCode(...e)
  )
}
/* eslint-enable */

function checkDecoderFunction(bind: Binding): DecoderType | undefined {
  const { path: fx } = bind
  if (!fx.isFunctionDeclaration()) return
  const body = fx.get('body').get('body')
  const retn = body[body.length - 1]

  if (
    deepIsReturnStatement(retn, {
      argument: {
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
          },
          computed: false,
          property: t.identifier('replace'),
        },
        arguments: [t.regExpLiteral('~', 'g'), t.stringLiteral('')],
      },
    })
  ) {
    // type = hexTable
    return DecoderType.HexTable
  } else if (
    deepIsReturnStatement(retn, {
      argument: {
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: {
            type: 'MemberExpression',
            object: t.identifier('String'),
            computed: true,
            property: {
              // todo: (LL[0] = 'fromCharCode')
              type: 'MemberExpression',
              property: t.numericLiteral(0),
            },
          },
          computed: true,
          property: {
            type: 'MemberExpression',
            computed: true,
            // todo: (LL[1] = 'apply')
            property: t.numericLiteral(1),
          },
        },
        arguments: [t.identifier('String'), t.identifier(es('e'))],
      },
    })
  ) {
    return DecoderType.Ascii85
  } else if (
    deepIsReturnStatement(retn, {
      argument: {
        type: 'Identifier',
      },
    })
  ) {
    return DecoderType.Base32
  }
  return undefined
}

export default createTransformer('jsconfuser/stringdecoder', {
  schema,

  run(ctx) {
    ctx.traverse({
      VariableDeclarator(p) {
        // Find string arrays
        const id = p.get('id')
        const init = p.get('init')
        if (!init.isCallExpression()) return
        if (!id.isIdentifier()) return

        const out = {} as {
          elements: (t.SpreadElement | t.Expression)[]
          arrayId1: string
          arrayId2: string
          retnId: string
          a1: string
          a2: string
        }
        if (
          !deepIsCallExpression(
            init,
            {
              callee: {
                type: 'FunctionExpression',
                params: [],
                body: {
                  type: 'BlockStatement',
                  // @ts-expect-error shh
                  body: ae({
                    items: [
                      {
                        type: 'VariableDeclaration',
                        declarations: [
                          {
                            type: 'VariableDeclarator',
                            id: t.identifier(es('arrayId1')),
                            init: {
                              type: 'ArrayExpression',
                              // @ts-expect-error shh
                              elements: es('elements'),
                            },
                          },
                        ],
                      },
                      t.expressionStatement(
                        t.conditionalExpression(
                          t.identifier(es('a1')),
                          t.callExpression(t.memberExpression(t.identifier(es('arrayId2')), t.identifier('pop')), []),
                          t.updateExpression('++', t.identifier(es('a2')), false)
                        )
                      ),
                      t.returnStatement(t.identifier(es('retnId'))),
                    ],
                    mode: ArrayMode.Exact,
                  }),
                },
              },
            },
            out
          )
        )
          return
        if (out.arrayId1 !== out.arrayId2) return
        if (out.arrayId1 !== out.retnId) return
        if (out.a1 !== out.a2) return

        const bind = p.scope.getBinding(id.node.name)
        if (!bind) return

        const strArr: StringArray = {
          identifier: id.node.name,
          elements: out.elements as t.StringLiteral[],
        }

        // Find string decoder functions
        for (const ref of bind.referencePaths) {
          if (ref.key !== 'object') continue
          const { parentPath: mx } = ref
          if (!mx?.isMemberExpression()) continue
          const { path: fx } = mx.scope
          if (!fx.isFunctionDeclaration()) continue
          const funcId = fx.get('id')
          if (!funcId.isIdentifier()) continue

          const funcBind = mx.scope.getBinding(funcId.node.name)
          if (!funcBind) continue

          const ofx = {} as {
            realFn: string
            strArr: string
            z0: string
            z1: string

            cache0: string
            x0: string

            cache1: string
            x1: string

            cache2: string
            x2: string

            x3: string
          }
          const body = fx.get('body').get('body')
          const last = body[body.length - 1]

          const x = (i: number) => t.identifier(es('x' + i.toString()))
          const emx = (i: number) => t.memberExpression(t.identifier(es('cache' + i.toString())), x(i), true)

          if (
            !deepIsReturnStatement(
              last,
              {
                argument: {
                  type: 'LogicalExpression',
                  left: emx(0),
                  operator: '||',
                  right: t.sequenceExpression([
                    t.assignmentExpression(
                      '=',
                      t.identifier(es('z0')),
                      t.sequenceExpression([emx(1), t.identifier(es('realFn'))])
                    ),
                    t.assignmentExpression('=', emx(2), {
                      type: 'CallExpression',
                      callee: t.identifier(es('z1')),
                      arguments: [t.memberExpression(t.identifier(es('strArr')), x(3), true)],
                    }),
                  ]),
                },
              },
              ofx
            )
          )
            continue

          if (!allEqual([ofx.cache0, ofx.cache1, ofx.cache2])) continue
          if (!allEqual([ofx.x0, ofx.x1, ofx.x2, ofx.x3])) continue
          if (!allEqual([ofx.z0, ofx.z1])) continue

          const realBind = mx.scope.getBinding(ofx.realFn)
          if (!realBind) continue
          const type = checkDecoderFunction(realBind)

          ctx.log.debug(type)
          if (type) {
            for (const ref of funcBind.referencePaths) {
              const { parentPath: cx } = ref
              if (!cx?.isCallExpression()) continue
              const args = cx.get('arguments')
              if (args.length !== 1) continue
              const [idx] = args
              if (!idx.isNumericLiteral()) continue
              const val = getValueOfNode(idx)

              const realStr = getValueOfNode(strArr.elements[val])

              let decoded: string
              switch (type) {
                case DecoderType.HexTable:
                  decoded = decodeHexTable(realStr)
                  break
                case DecoderType.Base32:
                  decoded = decodeBase32(realStr)
                  break
                case DecoderType.Ascii85:
                  decoded = decodeAscii85(realStr)
                  break
              }

              const literal = createLiteral(decoded)
              if (literal) {
                cx.replaceWith(literal)
                cx.scope.crawl()
              }
            }
            if (!bindingIsReferenced(funcBind)) {
              funcBind.path.remove()
            }
          }
        }
      },
    })
  },
})
