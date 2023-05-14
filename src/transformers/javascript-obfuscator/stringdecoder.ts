import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { Context } from '~/context'
import { Binding, NodePath } from '@babel/traverse'
import {
  deepIsBinaryExpression,
  deepIsExpressionStatement,
  deepIsReturnStatement,
  deepIsVariableDeclaration,
} from 'generated:nodePathEquality'
import { ArrayMode, ae, es } from '~/util/equality'
import {
  NodeOrPath,
  createLiteral,
  getNodeFromUnion,
  getValueOfNode,
  literalOrUnaryExpressionToNumber,
} from '~/util/translator'
import { bindingIsReferenced } from '~/util/scope'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'javascript-obfuscator/stringdecoder': z.input<typeof schema>
    }
  }
}

enum DecoderFunctionType {
  Simple = 'simple',
  Base64 = 'base64',
  RC4 = 'rc4',
}
interface IDecoderFunction {
  identifier: string
  type: DecoderFunctionType
  offset: number
  binding: Binding

  keyParam: number
  seedParam: number
}
interface DecoderFunctionSimple extends IDecoderFunction {
  type: DecoderFunctionType.Simple
}
interface DecoderFunctionBase64 extends IDecoderFunction {
  type: DecoderFunctionType.Base64
  charset: string
}
interface DecoderFunctionRC4 extends IDecoderFunction {
  type: DecoderFunctionType.RC4
  charset: string
}

type DecoderFunction = DecoderFunctionSimple | DecoderFunctionBase64 | DecoderFunctionRC4

interface RotatorFunction {
  iifePath: NodePath<t.CallExpression>
  parseIntChain: t.BinaryExpression
  breakCond: number
}
interface StringArray {
  type: 'variable' | 'function'
  identifier: string
  binding: Binding
  items: string[]

  rotated: boolean

  decoders: DecoderFunction[]
  rotators: RotatorFunction[]
}

type CheckDecoderFuncArgs = { arrayId: string; localArrayId: string; identifier: string }

function checkInnerDecoderFunction(
  ctx: Context,
  { arrayId, localArrayId, identifier }: CheckDecoderFuncArgs,
  func: NodePath<t.FunctionExpression>,
  stringArrays: StringArray[]
) {
  const body = func.get('body').get('body')
  const [ax, vdec, next] = body

  const oAx = {} as {
    idKey: string
    leftIdKey: string
    operator: t.BinaryExpression['operator']
    offset: t.NumericLiteral | t.UnaryExpression
  }
  if (
    !deepIsExpressionStatement(
      ax,
      {
        expression: {
          type: 'AssignmentExpression',
          left: {
            type: 'Identifier',
            name: es('idKey'),
          },
          operator: '=',
          right: {
            type: 'BinaryExpression',
            left: {
              type: 'Identifier',
              name: es('leftIdKey'),
            },
            operator: es('operator'),
            right: es('offset'),
          },
        },
      },
      oAx
    )
  )
    return
  if (oAx.idKey !== oAx.leftIdKey) return

  const oVd = { var: '' }
  if (
    !deepIsVariableDeclaration(
      vdec,
      {
        declarations: ae({
          items: [
            {
              type: 'VariableDeclarator',
              id: {
                type: 'Identifier',
                name: es('var'),
              },
              init: {
                type: 'MemberExpression',
                object: t.identifier(localArrayId),
                computed: true,
                property: t.identifier(oAx.idKey),
              },
            },
          ],
          mode: ArrayMode.Exact,
        }),
      },
      oVd
    )
  )
    return

  const binding = func.scope.getBinding(identifier)
  if (!binding) return

  let decoder: DecoderFunction = {
    identifier,
    type: DecoderFunctionType.Simple,
    offset: literalOrUnaryExpressionToNumber(oAx.offset) * (oAx.operator === '-' ? -1 : 1),
    binding,

    keyParam: 0,
    seedParam: 1,
  }

  if (next.isIfStatement()) {
    const test = next.get('test')
    if (
      !deepIsBinaryExpression(test, {
        type: 'BinaryExpression',
        left: {
          type: 'MemberExpression',
          object: t.identifier(identifier),
        },
        operator: '===',
        right: t.identifier('undefined'),
      })
    )
      return

    const consequent = next.get('consequent')
    if (!consequent.isBlockStatement()) return
    const body = consequent.get('body')
    const vds = body.filter(i => i.isVariableDeclaration()) as NodePath<t.VariableDeclaration>[]
    const oVdCharset = {} as { charset: string }
    if (vds.length >= 1) {
      // Base64 (first is base64)
      const [b64] = vds[0].get('declarations')
      const fn = b64.get('init')
      if (!fn?.isFunctionExpression()) return
      const [vdCharset] = fn.get('body').get('body')
      if (
        !deepIsVariableDeclaration(
          vdCharset,
          {
            declarations: ae({
              items: [
                {
                  type: 'VariableDeclarator',
                  id: {
                    type: 'Identifier',
                    name: es('charsetId'),
                  },
                  init: {
                    type: 'StringLiteral',
                    value: es('charset'),
                  },
                },
              ],
              mode: ArrayMode.Exact,
            }),
          },
          oVdCharset
        )
      )
        return

      if (oVdCharset.charset.length !== 65) return
      decoder = { ...decoder, type: DecoderFunctionType.Base64, charset: oVdCharset.charset }
    }
    if (vds.length === 2) {
      // RC4
      const [rc4] = vds[1].get('declarations')
      const fn = rc4.get('init')
      if (!fn?.isFunctionExpression()) return
      decoder = { ...decoder, type: DecoderFunctionType.RC4, charset: oVdCharset.charset }
    }
  }

  const lastStmt = body[body.length - 1]
  // returns the decoded string at the end?
  if (
    !deepIsReturnStatement(lastStmt, {
      argument: t.identifier(oVd.var),
    })
  )
    return

  const strArr = stringArrays.find(i => i.identifier === arrayId)
  if (!strArr) return
  strArr.decoders.push(decoder)
  ctx.log.info(
    `Found decoder function ${identifier} for ${strArr.identifier} (type = ${decoder.type}, #ref = ${binding.references})`
  )
}

function checkForDecoderFunction(ctx: Context, binding: Binding, p: NodePath<t.Function>, stringArrays: StringArray[]) {
  const block = p.get('body')
  if (!block.isBlockStatement()) return
  const body = block.get('body')
  if (body.length !== 3) return
  const [vdec, ax, retn] = body
  const [identifier] = Object.keys(p.getOuterBindingIdentifiers())

  const oVd = { arrayId: '' }

  const { name: realArrayId } = binding.identifier

  if (
    !deepIsVariableDeclaration(
      vdec,
      {
        declarations: ae({
          items: [
            {
              type: 'VariableDeclarator',
              init: t.callExpression(t.identifier(realArrayId), []),
              id: {
                type: 'Identifier',
                name: es('arrayId'),
              },
            },
          ],
          mode: ArrayMode.Exact,
        }),
      },
      oVd
    )
  )
    return

  if (
    !deepIsExpressionStatement(ax, {
      expression: {
        type: 'AssignmentExpression',
        left: t.identifier(identifier),
        operator: '=',
        right: {
          type: 'FunctionExpression',
        },
      },
    })
  )
    return

  if (
    !deepIsReturnStatement(retn, {
      argument: { type: 'CallExpression', callee: t.identifier(identifier) },
    })
  )
    return

  // debugger

  const eax = ax.get('expression')
  if (!eax.isAssignmentExpression()) return
  const func = eax.get('right')
  if (!func.isFunctionExpression()) return

  // if (func.body.body.length < 3) {
  // checkForSimpleDecoder(ctx, { arrayId: realArrayId, localArrayId: oVd.arrayId, identifier }, func, stringArrays)
  checkInnerDecoderFunction(ctx, { arrayId: realArrayId, localArrayId: oVd.arrayId, identifier }, func, stringArrays)
  // }
}

function checkForRotateFunction(
  ctx: Context,
  binding: Binding,
  p: NodePath<t.CallExpression>,
  stringArrays: StringArray[]
) {
  if (!p.isCallExpression()) return
  const fx = p.get('callee')
  if (!fx.isFunctionExpression()) return
  const [_arg0, arg1] = p.get('arguments')
  if (!arg1.isUnaryExpression() && !arg1.isNumericLiteral()) return
  const breakCond = literalOrUnaryExpressionToNumber(arg1)

  const [vdec, wst] = fx.get('body').get('body')

  if (!vdec.isVariableDeclaration()) return
  const [vdr] = vdec.get('declarations')
  const vdrId = vdr.get('id')
  if (!vdrId.isIdentifier()) return
  const { name: localArrayId } = vdrId.node
  const vdrCx = vdr.get('init')
  if (!vdrCx.isCallExpression()) return

  {
    if (!wst.isWhileStatement()) return
    const test = wst.get('test')
    if (!test.isBooleanLiteral({ value: true })) return
    const wb = wst.get('body')
    if (!wb.isBlockStatement()) return
    const [tst] = wb.get('body')
    if (!tst.isTryStatement()) return
    const block = tst.get('block')

    {
      const handler = tst.get('handler')
      const hBlock = handler.get('body')
      if (Array.isArray(hBlock) || !hBlock.isBlockStatement()) return
      const [expr] = hBlock.get('body')
      if (
        !deepIsExpressionStatement(expr, {
          type: 'ExpressionStatement',
          expression: {
            type: 'CallExpression',
            callee: t.memberExpression(t.identifier(localArrayId), t.identifier('push')),
            arguments: ae({
              items: [t.callExpression(t.memberExpression(t.identifier(localArrayId), t.identifier('shift')), [])],
              mode: ArrayMode.Exact,
            }),
          },
        })
      )
        return

      const blockBody = block.get('body')
      let decl: NodePath<t.VariableDeclarator> | undefined
      const found = blockBody.find(p => {
        if (!p.isVariableDeclaration()) return false
        const declarations = p.get('declarations')
        decl = declarations.find(d => {
          const id = d.get('id')
          if (!id.isIdentifier()) return false
          const bx = d.get('init')
          if (!bx.isBinaryExpression()) return false
          return true
        })
        if (!decl) return false
        return true
      })
      if (!decl || !found) return
      const d = decl.get('init')
      if (!d.isBinaryExpression()) return
      const strArr = stringArrays.find(i => i.identifier === binding.identifier.name)
      if (!strArr) return
      strArr.rotators.push({
        parseIntChain: d.node,
        breakCond,
        iifePath: p,
      })
      ctx.log.info(`Found rotator IIFE for ${strArr.identifier} (breakCond = ${breakCond})`)
    }
  }
}

function decodeStringBase64(decoder: DecoderFunctionBase64 | DecoderFunctionRC4, input: string): string {
  let output = '',
    tempEncStr = ''
  for (
    let bc = 0, bs = 0, buffer, idx = 0;
    (buffer = input.charAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = decoder.charset.indexOf(buffer)
  }
  for (let k = 0, length = output.length; k < length; k++) {
    tempEncStr += '%' + ('00' + output.charCodeAt(k).toString(16)).slice(-2)
  }
  return decodeURIComponent(tempEncStr)
}
function decodeStringRC4(decoder: DecoderFunctionRC4, input: string, key: string): string {
  // eslint-disable-next-line prefer-const
  let s: number[] = [],
    j = 0,
    x,
    output = ''

  input = decodeStringBase64(decoder, input)

  let i
  for (i = 0; i < 256; i++) {
    s[i] = i
  }
  for (i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256
    x = s[i]
    s[i] = s[j]
    s[j] = x
  }
  i = 0
  j = 0
  for (let y = 0; y < input.length; y++) {
    i = (i + 1) % 256
    j = (j + s[i]) % 256
    x = s[i]
    s[i] = s[j]
    s[j] = x
    output += String.fromCharCode(input.charCodeAt(y) ^ s[(s[i] + s[j]) % 256])
  }
  return output
}

function decodeString(stringArray: StringArray, call: NodeOrPath<t.CallExpression>): string | false {
  const callNode = getNodeFromUnion(call)
  if (!t.isIdentifier(callNode.callee)) return false
  const decoderId = callNode.callee.name
  const decoder = stringArray.decoders.find(i => i.identifier === decoderId)
  if (!decoder) return false
  const keyNode = callNode.arguments.at(decoder.keyParam),
    seedNode = callNode.arguments.at(decoder.seedParam)
  if (!t.isUnaryExpression(keyNode) && !t.isNumericLiteral(keyNode)) return false
  if (!t.isUnaryExpression(seedNode) && !t.isNumericLiteral(seedNode) && !t.isStringLiteral(seedNode)) return false
  const key = getValueOfNode(keyNode),
    seed = getValueOfNode(seedNode)

  const value = stringArray.items[key + decoder.offset]

  switch (decoder.type) {
    case DecoderFunctionType.Simple:
      return value
    case DecoderFunctionType.Base64:
      return decodeStringBase64(decoder, value)
    case DecoderFunctionType.RC4:
      return decodeStringRC4(decoder, value, seed as string)
    default:
      return false
  }
}

function checkForStringArray(ctx: Context, p: NodePath<t.Function>, stringArrays: StringArray[]) {
  if (!p.isFunctionDeclaration()) return
  const body = p
    .get('body') /* BlockStatement */
    .get('body') /* Statement[] */
  if (!body.length) return
  if (body.length !== 3) return
  const [vdec, ax, retn] = body
  const [identifier] = Object.keys(p.getOuterBindingIdentifiers())

  const oVd: {
    vars: string[]
    elements: t.StringLiteral[]
  } = { vars: [], elements: [] }

  if (
    !deepIsVariableDeclaration(
      vdec,
      {
        declarations: ae<t.VariableDeclarator>({
          items: [
            {
              type: 'VariableDeclarator',
              id: t.identifier(es('vars')),
              init: {
                type: 'ArrayExpression',
                // @ts-expect-error stop it
                elements: es('elements'),
              },
            },
          ],
          mode: ArrayMode.Exact,
        }),
      },
      oVd
    )
  )
    return
  if (!oVd.elements.every(e => t.isStringLiteral(e))) return

  if (
    !deepIsExpressionStatement(
      ax,
      t.expressionStatement(
        // (this id) = function() { return (stringArrayId); }
        t.assignmentExpression(
          '=',
          t.identifier(identifier),
          t.functionExpression(
            null,
            [],
            t.blockStatement(
              // return String array
              [t.returnStatement(t.identifier(oVd.vars[0]))]
            )
          )
        )
      )
    )
  )
    return

  if (
    !deepIsReturnStatement(retn, {
      argument: t.callExpression(t.identifier(identifier), []),
    })
  )
    return

  const binding = p.scope.getBinding(identifier)
  if (!binding) return

  stringArrays.push({
    type: 'function',
    identifier,
    binding,
    items: oVd.elements.map(l => l.value),
    rotated: false,
    decoders: [],
    rotators: [],
  })
  ctx.log.info(`Found string array ${identifier} (type = function)`)

  // Check for decoder and rotate functions
  if (binding) {
    if (!binding.referenced) return
    for (const ref of binding.referencePaths) {
      if (ref.listKey === 'arguments') {
        const parent = ref.parentPath
        if (!parent?.isCallExpression()) continue
        const callee = parent.get('callee')
        if (!callee.isFunctionExpression()) continue
        // Possibly rotate function
        checkForRotateFunction(ctx, binding, parent, stringArrays)
      } else if (ref.key === 'callee') {
        const fn = ref.scope.path
        if (!fn.isFunction()) continue
        // Possibly decoder function
        checkForDecoderFunction(ctx, binding, fn, stringArrays)
      }
    }
  }
  return
}

function solveStringArrayRotation(ctx: Context, strArr: StringArray, rot: RotatorFunction) {
  let iterations = 0
  const maxIter = strArr.items.length * 2
  const _ = t.identifier('a')
  while (iterations < maxIter) {
    // const pic = t.cloneDeepWithoutLoc()
    const b = t.variableDeclarator(_, t.cloneDeepWithoutLoc(rot.parseIntChain))
    const pic = NodePath.get({
      hub: ctx.hub,
      parentPath: null,
      parent: b,
      container: b,
      key: 'init',
    }) as NodePath<t.BinaryExpression>
    let invalid = false
    strArr.items.push(strArr.items.shift()!)

    t.traverseFast(pic.node, cx => {
      if (!t.isCallExpression(cx)) return
      if (
        !t.isIdentifier(cx.callee, {
          name: 'parseInt',
        })
      )
        return

      if (cx.arguments.length !== 1) return
      const [dec] = cx.arguments
      if (!t.isCallExpression(dec)) return
      if (!t.isIdentifier(dec.callee)) return
      try {
        const solved = decodeString(strArr, dec)
        if (!solved) return (invalid = true)

        const iv = parseInt(solved)
        if (isNaN(iv)) return (invalid = true)
        const lit = createLiteral(iv)
        if (!lit) return (invalid = true)
        Object.assign(cx, lit)
      } catch (err) {
        invalid = true
        // idk
      }
    })
    if (++iterations === maxIter) {
      ctx.log.warn(`${strArr.identifier} rotator iterations exceeded max iterations (${iterations}/${maxIter})`)
    }
    if (invalid) continue
    const evalResult = pic.evaluate()
    if (!evalResult.confident) continue
    if (evalResult.value == rot.breakCond) {
      ctx.log.debug(`Rotated string array ${strArr.identifier} in ${iterations}/${maxIter}`)
      strArr.rotated = true
      rot.iifePath.remove()
      break
    }
  }
}

export default createTransformer('javascript-obfuscator/stringdecoder', {
  schema,

  run(ctx) {
    const stringArrays: StringArray[] = []
    ctx.traverse({
      Function(p) {
        checkForStringArray(ctx, p, stringArrays)
      },
    })

    for (const strArr of stringArrays) {
      ctx.log.info(
        `Processing string array ${strArr.identifier} (rotators = ${strArr.rotators.length}, decoders = ${strArr.decoders.length})`
      )
      if (strArr.rotators.length) {
        const [rot] = strArr.rotators
        solveStringArrayRotation(ctx, strArr, rot)
        if (!strArr.rotated) {
          ctx.log.warn(`Could not rotate string array ${strArr.identifier}`)
          continue
        }
      }

      for (const dec of strArr.decoders) {
        for (const ref of dec.binding.referencePaths) {
          const { parentPath } = ref
          if (!parentPath?.isCallExpression()) continue
          const str = decodeString(strArr, parentPath.node)
          const lit = createLiteral(str)
          if (!lit) {
            ctx.log.debug("couldn't decode this path", parentPath.toString())
            continue
          }
          parentPath.replaceWith(lit)
        }
        if (!bindingIsReferenced(dec.binding, true)) {
          dec.binding.path.remove()
        }
      }

      strArr.binding.scope.crawl()
      const binding = (strArr.binding = strArr.binding.scope.getBinding(strArr.binding.identifier.name)!)
      let referenced = binding.referenced
      if (binding.constantViolations.length === 1 && binding.references === 1) {
        const cv = binding.constantViolations[0]
        const ref = binding.referencePaths[0]
        const { path: parent } = strArr.binding
        if (cv.isDescendant(parent) && ref.isDescendant(parent)) referenced = false
      }
      if (!referenced) {
        binding.path.remove()
      }
    }
  },
})
