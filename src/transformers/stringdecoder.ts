import {
  Program,
  BlockStatement,
  Node,
  sp,
  VariableDeclaration,
  ExpressionStatement,
  ReturnStatement,
  CallExpression,
  FunctionExpression,
  AssignmentExpression,
  StringLiteral,
  Identifier,
  Statement,
  Literal,
  UnaryExpression,
  Expression,
  BinaryExpression,
  VariableDeclarator,
  NumericLiteral,
} from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import { immutate, filterEmptyStatements } from '../util/helpers'

import Context, {
  DecoderFunction,
  DecoderFunctionBase64,
  DecoderFunctionRC4,
  DecoderFunctionType,
  DecoderReference,
  StringArrayType,
} from '../context'
import { literalOrUnaryExpressionToNumber } from '../util/translator'
import Simplify from './simplify'

export interface StringDecoderOptions extends TransformerOptions {}
export default class StringDecoder extends Transformer<StringDecoderOptions> {
  constructor(options: Partial<StringDecoderOptions>) {
    super('StringDecoder', options)
  }

  private literals_to_arg_array(
    array: Node[]
  ): (string | number | undefined)[] {
    return array.map((n) =>
      Guard.isUnaryExpression(n)
        ? literalOrUnaryExpressionToNumber(n, true)
        : Guard.isLiteral(n)
        ? (n.value as string | number)
        : undefined
    )
  }

  private util_b64_decode(chars: string, input: string): string {
    let output = '',
      tempEncStr = ''
    for (
      let bc = 0, bs = 0, buffer, idx = 0;
      (buffer = input.charAt(idx++));
      ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
        ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
        : 0
    ) {
      buffer = chars.indexOf(buffer)
    }
    for (let k = 0, length = output.length; k < length; k++) {
      tempEncStr += '%' + ('00' + output.charCodeAt(k).toString(16)).slice(-2)
    }
    return decodeURIComponent(tempEncStr)
  }
  private util_rc4_decode(chars: string, str: string, key: string): string {
    // sorry
    let s = [],
      j = 0,
      x,
      output = ''

    str = this.util_b64_decode(chars, str)

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
    for (let y = 0; y < str.length; y++) {
      i = (i + 1) % 256
      j = (j + s[i]) % 256
      x = s[i]
      s[i] = s[j]
      s[j] = x
      output += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[j]) % 256])
    }
    return output
  }

  private util_decode = (
    context: Context,
    identifier: string,
    args: (string | number | undefined)[]
  ) => {
    // """type safety"""
    let decoder: DecoderFunction,
      offset = 0,
      indexArg = 0,
      keyArg = 1,
      decRef = -1

    let predicate = (dec: DecoderFunction | DecoderReference) =>
      dec.identifier === identifier
    if (context.stringDecoders.findIndex(predicate) !== -1) {
      decoder = context.stringDecoders.find(predicate)!
    } else if (
      (decRef = context.stringDecoderReferences.findIndex(predicate)) !== -1
    ) {
      let ref = context.stringDecoderReferences[decRef]
      offset += ref.additionalOffset
      let fndDec: DecoderReference | undefined = ref as any
      identifier = ref.realIdentifier
      while (fndDec) {
        fndDec = context.stringDecoderReferences.find(predicate)
        if (fndDec) {
          /*context.log(
            'Resolved parent ref id=',
            identifier,
            'found =',
            fndDec.realIdentifier
          )*/
          offset += fndDec.additionalOffset
          identifier = fndDec.realIdentifier
        }
      }
      decoder = context.stringDecoders.find(predicate)!
      if (typeof ref.indexArgument === 'number') indexArg = ref.indexArgument
      if (typeof ref.keyArgument === 'number') keyArg = ref.keyArgument
    } else {
      throw new TypeError(`Failed to decode ${identifier}, no decoder`)
    }

    offset += decoder.offset
    let index =
        typeof args[indexArg] === 'string'
          ? parseInt(args[indexArg] as string)
          : (args[indexArg] as number),
      key = ''

    switch (decoder.type) {
      case DecoderFunctionType.SIMPLE:
        return this.decodeSimple(context, identifier, index, offset)
      case DecoderFunctionType.BASE64:
        return this.decodeBase64(context, identifier, index, offset)
      case DecoderFunctionType.RC4:
        key = args[keyArg] as string
        return this.decodeRC4(context, identifier, index, key, offset)
      default:
        throw new TypeError('Invalid decoder function type')
    }
  }

  getString = (
    context: Context,
    decoderIdentifier: string,
    index: number,
    offset: number
  ): string => {
    const stringDecoder = context.stringDecoders.find(
      (i) => i.identifier === decoderIdentifier
    )
    if (!stringDecoder)
      throw new Error(
        `Failed to find string decoder with identifier "${decoderIdentifier}"`
      )

    const strArray = context.stringArrays.find(
      (i) => i.identifier === stringDecoder.stringArrayIdentifier
    )
    if (!strArray)
      throw new Error(
        `Failed to find string array with identifier "${stringDecoder.stringArrayIdentifier}"`
      )

    return strArray.strings[index + offset]
  }

  decodeSimple(
    context: Context,
    identifier: string,
    index: number,
    offset: number
  ) {
    return this.getString(context, identifier, index, offset)
  }
  decodeBase64(
    context: Context,
    identifier: string, // grab the charset from our identifier
    index: number,
    offset: number
  ) {
    let str = this.getString(context, identifier, index, offset),
      charset = (
        context.stringDecoders.find(
          (d) =>
            d.identifier === identifier && d.type === DecoderFunctionType.BASE64
        ) as DecoderFunctionBase64
      ).charset
    return this.util_b64_decode(charset, str)
  }
  decodeRC4(
    context: Context,
    identifier: string,
    index: number,
    key: string,
    offset: number
  ) {
    let str = this.getString(context, identifier, index, offset),
      charset = (
        context.stringDecoders.find(
          (d) =>
            d.identifier === identifier && d.type === DecoderFunctionType.RC4
        ) as DecoderFunctionRC4
      ).charset
    return this.util_rc4_decode(charset, str, key)
  }

  // Find the string array automatically
  // !! Must match to hardcoded function schema !!
  stringsFinder(context: Context) {
    // look for array
    if (context.stringArrays.some((i) => i.type === StringArrayType.ARRAY)) {
      walk(context.ast, {
        VariableDeclaration(node, _, ancestors) {
          let rm: string[] = []
          for (const vd of node.declarations) {
            if (!Guard.isIdentifier(vd.id)) continue
            if (!vd.init || !Guard.isArrayExpression(vd.init)) continue
            const identifier = vd.id.name
            if (
              !context.stringArrays.find(
                (i) =>
                  i.type === StringArrayType.ARRAY &&
                  i.identifier === identifier
              )
            )
              continue

            if (!vd.init.elements.every((e) => Guard.isLiteralString(e as any)))
              continue
            const strArray = context.stringArrays.find(
              (i) => i.identifier === identifier
            )!
            strArray.strings = (vd.init.elements as StringLiteral[]).map(
              (e) => e.value
            ) as string[]

            context.log(
              'Found string array at',
              strArray.identifier,
              '#',
              strArray.strings.length
            )
            rm.push(`${vd.start}!${vd.end}`)
          }

          node.declarations = node.declarations.filter(
            (d) => !rm.includes(`${d.start}!${d.end}`)
          )
        },
      })
    }

    walk(context.ast, {
      FunctionDeclaration(node) {
        const block = node.body
        if (block.body.length !== 3) return // Not a proxy string array fn
        // user typeguards dont work on array elements :)))))))))))))
        if (!Guard.isVariableDeclaration(block.body[0])) return
        if (!Guard.isExpressionStatement(block.body[1])) return
        if (!Guard.isReturnStatement(block.body[2])) return

        if (!Guard.isIdentifier(block.body[0].declarations[0].id)) return
        if (
          !block.body[0].declarations[0].init ||
          block.body[0].declarations[0].init?.type !== 'ArrayExpression' // `init?: Expression | null | undefined` ??????
        )
          return
        let fnId = node.id?.name,
          strArrayId = block.body[0].declarations[0].id.name,
          strArray = block.body[0].declarations[0].init
        if (
          !Guard.isAssignmentExpression(block.body[1].expression) ||
          !Guard.isIdentifier(block.body[1].expression.left) ||
          block.body[1].expression.left.name !== fnId ||
          !Guard.isFunctionExpression(block.body[1].expression.right) ||
          !Guard.isReturnStatement(
            block.body[1].expression.right.body.body[0]
          ) ||
          block.body[1].expression.right.body.body[0].argument?.type !==
            'Identifier' ||
          block.body[1].expression.right.body.body[0].argument.name !==
            strArrayId
        )
          return
        if (!strArray.elements.every((e) => Guard.isLiteralString(e as any)))
          return

        const strArrayObj = {
          identifier: fnId,
          type: StringArrayType.FUNCTION,
          strings: (strArray.elements as StringLiteral[]).map((e) => e.value),
        }
        if (context.removeGarbage) {
          ;(node as any).type = 'EmptyStatement'
        }
        context.stringArrays.push(strArrayObj)
        context.log(
          'Found string array at',
          strArrayObj.identifier,
          '#',
          strArrayObj.strings.length
        )
      },
    })
    return this
  }

  funcFinder(context: Context) {
    walk(context.ast, {
      FunctionDeclaration(node) {
        if (!node.id) return
        const block = node.body
        const fnId = node.id.name

        if (block.body.length > 3 && block.body.length < 1) return
        if (!block.body[0]) return
        // stringArray declaration
        if (
          !Guard.isVariableDeclaration(block.body[0]) &&
          block.body.length !== 1
        )
          return
        let retn = block.body[block.body.length - 1]
        if (!Guard.isReturnStatement(retn) || !retn.argument) return
        let fn: FunctionExpression,
          ae: AssignmentExpression | undefined = undefined

        if (retn.argument.type === 'SequenceExpression') {
          if (
            !Guard.isReturnStatement(retn) ||
            retn.argument?.type !== 'SequenceExpression' ||
            retn.argument.expressions.length !== 2 ||
            !Guard.isAssignmentExpression(retn.argument.expressions[0]) ||
            !Guard.isCallExpression(retn.argument.expressions[1])
            // check callexp callee and args?
          )
            return
          ae = retn.argument.expressions[0]
        } else if (retn.argument.type === 'CallExpression') {
          if (
            !Guard.isIdentifier(retn.argument.callee) ||
            retn.argument.callee.name !== fnId ||
            !Guard.isExpressionStatement(block.body[1]) ||
            !Guard.isAssignmentExpression(block.body[1].expression)
          )
            return

          ae = block.body[1].expression
        }

        if (!ae) return

        if (
          !Guard.isIdentifier(ae.left) ||
          ae.left.name !== fnId ||
          !Guard.isFunctionExpression(ae.right)
        )
          return
        fn = ae.right

        const stringArrayNames = context.stringArrays.map((i) => i.identifier)
        let ourStringArray = ''

        if (
          block.body.length !== 1 &&
          Guard.isVariableDeclaration(block.body[0])
        ) {
          if (
            block.body[0].declarations[0].init?.type !== 'CallExpression' ||
            block.body[0].declarations[0].init.callee.type !== 'Identifier' ||
            !stringArrayNames.includes(
              block.body[0].declarations[0].init.callee.name
            )
          )
            return

          ourStringArray = block.body[0].declarations[0].init.callee.name
        }
        const body = fn.body.body as Statement[]
        if (block.body.length === 1) {
          if (
            !body[1] ||
            !Guard.isVariableDeclaration(body[1]) ||
            body[1].declarations[0].init?.type !== 'MemberExpression' ||
            !Guard.isIdentifier(body[1].declarations[0].init.object) ||
            !Guard.isIdentifier(body[1].declarations[0].init.property)
          )
            return
          // array reference, not function
          // locate the stringArray after funcFinder is ran

          ourStringArray = body[1].declarations[0].init.object.name
          let strArrayObj = {
            identifier: ourStringArray,
            type: StringArrayType.ARRAY,
            strings: [],
          }
          context.stringArrays.push(strArrayObj)
          context.log(
            'Added',
            strArrayObj.identifier,
            'as a string array to be found'
          )
        }

        let calcOffset = 0
        if (
          !Guard.isExpressionStatement(body[0]) ||
          !Guard.isAssignmentExpression(body[0].expression) ||
          !Guard.isBinaryExpression(body[0].expression.right) ||
          (!Guard.isLiteral(body[0].expression.right.right) &&
            !Guard.isUnaryExpression(body[0].expression.right.right))
        )
          return

        // our offset in our code will always be ADDED to the index,
        // not subtracted.
        calcOffset = literalOrUnaryExpressionToNumber(
          body[0].expression.right.right
        )
        if (body[0].expression.right.operator === '-')
          calcOffset = calcOffset * -1

        let decFn = {
          identifier: node.id.name,
          stringArrayIdentifier: ourStringArray,
          offset: calcOffset,
          type: DecoderFunctionType.SIMPLE,
          indexArgument: 0,
          keyArgument: 1,
        } as DecoderFunction

        if (body.length >= 3) {
          // possibly B64/RC4 type decoder
          if (Guard.isIfStatement(body[2])) {
            // check for B64 charset

            if (!Guard.isBlockStatement(body[2].consequent)) return
            if (body[2].consequent.body.length <= 1) return
            if (
              Guard.isExpressionStatement(body[2].consequent.body[0]) &&
              Guard.isAssignmentExpression(
                body[2].consequent.body[0].expression
              )
            ) {
              sp<VariableDeclaration>(body[2].consequent.body[0], {
                type: 'VariableDeclaration',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    start: 0,
                    end: 0,
                    id: {
                      type: 'Identifier',
                      start: 0,
                      end: 0,
                      name: 'b64dec',
                    },
                    init: body[2].consequent.body[0].expression.right,
                  },
                ],
              })
            }
            if (
              Guard.isExpressionStatement(body[2].consequent.body[1]) &&
              Guard.isAssignmentExpression(
                body[2].consequent.body[1].expression
              )
            ) {
              sp<VariableDeclaration>(body[2].consequent.body[1], {
                type: 'VariableDeclaration',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    start: 0,
                    end: 0,
                    id: {
                      type: 'Identifier',
                      start: 0,
                      end: 0,
                      name: 'rc4dec',
                    },
                    init: body[2].consequent.body[1].expression.right,
                  },
                ],
              })
            }

            if (
              Guard.isVariableDeclaration(body[2].consequent.body[0]) &&
              Guard.isFunctionExpression(
                body[2].consequent.body[0].declarations[0].init!
              ) &&
              (!Guard.isVariableDeclaration(body[2].consequent.body[1]) ||
                !Guard.isFunctionExpression(
                  body[2].consequent.body[1].declarations[0].init!
                ))
            ) {
              let fx = body[2].consequent.body[0].declarations[0].init,
                fxb = fx.body.body
              if (Guard.isVariableDeclaration(fxb[0])) {
                if (Guard.isLiteralString(fxb[0].declarations[0].init!)) {
                  let charset = fxb[0].declarations[0].init.value
                  if (charset.length === 65) {
                    // charset declaration
                    decFn.type = DecoderFunctionType.BASE64
                    ;(decFn as DecoderFunctionBase64).charset = charset
                  }
                }
              }
            } else if (
              body[2].consequent.body.length >= 3 &&
              // b64
              Guard.isVariableDeclaration(body[2].consequent.body[0]) &&
              Guard.isFunctionExpression(
                body[2].consequent.body[0].declarations[0].init!
              ) &&
              // rc4
              Guard.isVariableDeclaration(body[2].consequent.body[1]) &&
              Guard.isFunctionExpression(
                body[2].consequent.body[1].declarations[0].init!
              )
            ) {
              let fx = body[2].consequent.body[0].declarations[0].init,
                fxb = fx.body.body
              if (Guard.isVariableDeclaration(fxb[0])) {
                if (Guard.isLiteralString(fxb[0].declarations[0].init!)) {
                  let charset = fxb[0].declarations[0].init.value
                  if (charset.length === 65) {
                    // charset declaration

                    decFn.type = DecoderFunctionType.RC4
                    ;(decFn as DecoderFunctionRC4).charset = charset
                  }
                }
              }
            }
          }
        }

        context.stringDecoders.push(decFn)
        if (context.removeGarbage) {
          ;(node as any).type = 'EmptyStatement'
        }
        context.log(
          'Found decoder function',
          node.id?.name,
          'arrayId =',
          decFn.stringArrayIdentifier,
          'offset =',
          calcOffset,
          'type =',
          decFn.type
        )
      },
    })
    return this
  }

  calcShift = (
    context: Context,
    breakCond: number,
    stringArrayIdent: string,
    parseIntChain: BinaryExpression
  ) => {
    const { util_decode, literals_to_arg_array } = this
    const st = new Simplify({})
    // String eval loop
    // push/shift should only have #size unique combinations I think

    const stringArray = context.stringArrays.find(
      (i) => i.identifier === stringArrayIdent
    )!
    let maxLoops = stringArray.strings.length * 2,
      iteration = 0
    while (true) {
      iteration++
      if (iteration > maxLoops) {
        throw new Error(
          `Push/shift calculation failed (iter=${iteration}>maxLoops=${maxLoops})`
        )
      }
      // Classes suck
      const bpic = immutate(parseIntChain)
      let hasNaN = false

      stringArray.strings.push(stringArray.strings.shift() as string)

      // convert -?parseInt(strdec(idx)) / n [+*] $0 chain
      walk(bpic, {
        CallExpression(node) {
          // find parseInts
          if (
            !Guard.isIdentifier(node.callee) ||
            node.callee.name !== 'parseInt'
          )
            return

          if (
            node.arguments.length !== 1 ||
            node.arguments[0].type !== 'CallExpression' ||
            node.arguments[0].callee.type !== 'Identifier' ||
            node.arguments[0].arguments.length === 0 ||
            node.arguments[0].arguments.length > 5
          )
            return

          if (
            node.arguments[0].arguments[0].type !== 'Literal' &&
            node.arguments[0].arguments[0].type !== 'UnaryExpression'
          )
            return
          let val = -1
          try {
            let args = literals_to_arg_array(node.arguments[0].arguments)
            val = parseInt(
              util_decode(context, node.arguments[0].callee.name, args)
            )
          } catch (err) {
            throw err
          }

          if (isNaN(val)) {
            sp<Identifier>(node, {
              type: 'Identifier',
              name: 'NaN',
            })
            hasNaN = true
          } else {
            sp<Literal>(node, {
              type: 'Literal',
              value: val,
            })
          }
        },
      })

      if (hasNaN) {
        continue
      } else {
        // use our SimplifyTransformer to calculate end value
        st.math(bpic)
        if (
          (bpic as any).type === 'Literal' &&
          (bpic as Literal).value === breakCond
        )
          break
      }
    }
    context.shiftedArrays++
  }

  // Locate push/shift pair inside IIFE
  shiftFinder(context: Context) {
    const { calcShift } = this
    // retn TRUE if remove .
    function visitor(node: Node) {
      if (
        !Guard.isCallExpression(node) ||
        node.callee.type !== 'FunctionExpression'
      )
        return false

      const body = node.callee.body.body,
        bRev = [...body].reverse()

      if (body.length < 2) return
      let loopBody: Statement[]
      if (bRev[0].type === 'ForStatement') {
        if (!Guard.isBlockStatement(bRev[0].body)) return
        loopBody = filterEmptyStatements(bRev[0].body.body) as Statement[]
      } else if (bRev[0].type === 'WhileStatement') {
        if (!Guard.isBlockStatement(bRev[0].body)) return
        loopBody = filterEmptyStatements(bRev[0].body.body) as Statement[]
      } else {
        return
      }
      if (
        loopBody.length !== 1 ||
        loopBody[0].type !== 'TryStatement' ||
        filterEmptyStatements(loopBody[0].block.body).length !== 2
      )
        return
      let blockBody = filterEmptyStatements(loopBody[0].block.body)

      // string array id
      if (node.arguments.length !== 2) return
      if (node.arguments[0].type !== 'Identifier') return
      if (node.arguments[1].type !== 'Literal') return
      const breakCond = node.arguments[1].value
      let pic: Expression

      if (blockBody[0].type === 'VariableDeclaration') {
        if (!blockBody[0].declarations[0].init) return
        pic = blockBody[0].declarations[0].init as Expression
      } else if (blockBody[0].type === 'IfStatement') {
        if (
          !Guard.isBinaryExpression(blockBody[0].test) ||
          blockBody[0].test.operator !== '==='
        )
          return
        if (
          !Guard.isLiteralNumeric(blockBody[0].test.left) ||
          blockBody[0].test.left.value !== breakCond
        )
          return
        pic = blockBody[0].test.right
      } else {
        return
      }

      //pic = loopBody[0].block.body[0].declarations[0].init
      if (pic.type !== 'BinaryExpression') return

      const stringArrayIdent = node.arguments[0].name

      const stringArray = context.stringArrays.find(
        (i) => i.identifier === stringArrayIdent
      )
      if (!stringArray)
        throw new Error(
          `Failed to find string array with identifier "${stringArrayIdent}" for push/shift calc`
        )

      calcShift(context, breakCond as number, stringArray.identifier, pic)
      context.log('Found push/shift IIFE breakCond =', breakCond)
      if (context.removeGarbage) {
        return true
      }
      return false
    }
    walk(context.ast, {
      ExpressionStatement(node) {
        if (Guard.isSequenceExpression(node.expression)) {
          let rm: string[] = []
          for (const exp of node.expression.expressions) {
            if (visitor(exp)) rm.push(`${exp.start}!${exp.end}`)
          }
          if (rm) {
            node.expression.expressions = node.expression.expressions.filter(
              (d) => !rm.includes(`${d.start}!${d.end}`)
            )
          }
        } else {
          if (visitor(node.expression)) {
            ;(node as any).type = 'EmptyStatement'
          }
        }
      },
    })
    return this
  }

  shiftFinder2(context: Context) {
    const { calcShift } = this
    function visitor(node: Node) {
      if (
        !Guard.isCallExpression(node) ||
        node.callee.type !== 'FunctionExpression'
      )
        return false

      const body = node.callee.body.body,
        bRev = [...body].reverse()

      const scope = context.scopeManager.acquire(node.callee)
      if (!scope) return

      let foundPushShift = false,
        stringArrayRef: string

      walk(node, {
        ExpressionStatement(exp) {
          if (!Guard.isCallExpression(exp.expression)) return
          if (exp.expression.arguments.length === 0) return
          if (!Guard.isMemberExpression(exp.expression.callee)) return
          if (!Guard.isIdentifier(exp.expression.callee.object)) return
          if (!Guard.isIdentifier(exp.expression.callee.property)) return
          stringArrayRef = exp.expression.callee.object.name

          if (exp.expression.callee.property.name !== 'push') return
          const arg = exp.expression.arguments[0]
          if (!Guard.isCallExpression(arg)) return
          if (arg.arguments.length !== 0) return
          if (!Guard.isMemberExpression(arg.callee)) return
          if (!Guard.isIdentifier(arg.callee.object)) return
          if (!Guard.isIdentifier(arg.callee.property)) return
          if (arg.callee.object.name !== stringArrayRef) return
          if (arg.callee.property.name !== 'shift') return
          foundPushShift = true
        },
      })
      if (!foundPushShift) return false

      let foundStringArrayVar = scope.variables.find(
        (i) => i.name === stringArrayRef
      )
      if (!foundStringArrayVar) return false

      if (foundStringArrayVar.defs.length === 0) return false
      const def = foundStringArrayVar.defs[0],
        dnode = def.node as VariableDeclarator
      if (dnode.type !== 'VariableDeclarator') return false
      if (!dnode.init || !Guard.isCallExpression(dnode.init)) return false

      if (!Guard.isIdentifier(dnode.init.callee)) return false
      const stringArrayName = dnode.init.callee.name
      const stringArrayFunc = context.stringArrays.find(
        (i) => i.identifier === stringArrayName
      )
      if (!stringArrayFunc) return false

      let foundBinExp = false,
        breakCond: number | undefined,
        pic: BinaryExpression | undefined
      walk(node, {
        IfStatement(ifs) {
          if (!Guard.isBinaryExpression(ifs.test)) return
          if (ifs.test.operator !== '==' && ifs.test.operator !== '===') return
          let bc: NumericLiteral | undefined, bx: BinaryExpression | undefined
          if (Guard.isLiteralNumeric(ifs.test.left)) {
            if (!Guard.isBinaryExpression(ifs.test.right)) return
            bc = ifs.test.left
            bx = ifs.test.right
          } else if (Guard.isLiteralNumeric(ifs.test.right)) {
            if (!Guard.isBinaryExpression(ifs.test.left)) return
            bc = ifs.test.right
            bx = ifs.test.left
          }

          if (!bc || !bx) return
          pic = bx
          breakCond = bc.value
          foundBinExp = true
        },
      })
      if (!foundBinExp || !breakCond || !pic) return false

      context.log(
        'Found push/shift (#2) IIFE stringArray =',
        stringArrayFunc.identifier,
        'breakCond =',
        breakCond
      )
      calcShift(context, breakCond, stringArrayFunc.identifier, pic)

      return true
    }
    walk(context.ast, {
      ExpressionStatement(node) {
        if (Guard.isSequenceExpression(node.expression)) {
          let rm: string[] = []
          for (const exp of node.expression.expressions) {
            if (visitor(exp)) rm.push(`${exp.start}!${exp.end}`)
          }
          if (rm) {
            node.expression.expressions = node.expression.expressions.filter(
              (d) => !rm.includes(`${d.start}!${d.end}`)
            )
          }
        } else if (Guard.isUnaryExpression(node.expression)) {
          if (!Guard.isCallExpression(node.expression.argument)) return
          if (visitor(node.expression.argument)) {
            ;(node as any).type = 'EmptyStatement'
          }
        } else {
          if (visitor(node.expression)) {
            ;(node as any).type = 'EmptyStatement'
          }
        }
      },
    })
    return this
  }

  // Scan for variable references to the decoder functions
  varReferenceFinder(context: Context) {
    let newRefsFound = 0
    walk(context.ast, {
      VariableDeclaration(vd) {
        let rm: string[] = []
        for (const decl of vd.declarations) {
          if (decl.init?.type !== 'Identifier' || decl.id.type !== 'Identifier')
            continue
          let refName = decl.id.name,
            valName = decl.init.name
          let foundDecoder: DecoderFunction | DecoderReference | undefined =
            context.stringDecoders.find((d) => d.identifier === valName)
          if (!foundDecoder) {
            foundDecoder = context.stringDecoderReferences.find(
              (d) => d.identifier === valName
            )
            if (!foundDecoder) continue
          }
          context.log('Found variable reference', refName, valName)
          context.stringDecoderReferences.push({
            identifier: refName,
            realIdentifier: valName,
            additionalOffset: 0,
          })
          newRefsFound++
          if (context.removeGarbage) {
            rm.push(`${decl.start}!${decl.end}`)
          }
        }
        vd.declarations = vd.declarations.filter(
          (d) => !rm.includes(`${d.start}!${d.end}`)
        )
        if (vd.declarations.length === 0) {
          // this node wont generate if it has no declarations left
          ;(vd as any).type = 'EmptyStatement'
        }
      },
    })
    return newRefsFound
  }

  // Scan for function references to the decoder functions and their references
  fnReferenceFinder(context: Context) {
    let newRefsFound = 0
    walk(context.ast, {
      FunctionDeclaration(node) {
        let body = filterEmptyStatements(node.body.body)
        if (
          !node.id ||
          body.length !== 1 ||
          !Guard.isReturnStatement(body[0]) ||
          !node.params.every((p) => Guard.isIdentifier(p)) ||
          !body[0].argument ||
          !Guard.isCallExpression(body[0].argument) ||
          !Guard.isIdentifier(body[0].argument.callee)
        )
          return
        const fnId = node.id.name,
          retn = body[0],
          cx = body[0].argument!
        const calleeId = (cx.callee as Identifier).name
        let i = 0,
          offset = 0,
          indexArg = -1,
          keyArg = -1

        const parent = {
          identifier: '',
          indexArgument: -1,
          keyArgument: -1,
        }

        const parentFn = context.stringDecoders.find(
          (dec) => dec.identifier === calleeId
        )
        if (!parentFn) {
          // check for ref
          const ref = context.stringDecoderReferences.find(
            (dec) => dec.identifier === calleeId
          )
          if (!ref) return
          parent.identifier = ref.identifier
          parent.indexArgument = ref.indexArgument!
          parent.keyArgument = ref.keyArgument!
        } else {
          parent.identifier = parentFn.identifier
          parent.indexArgument = parentFn.indexArgument
          parent.keyArgument = parentFn.keyArgument
        }

        const params = (node.params as Identifier[]).map((id) => id.name),
          args = cx.arguments

        for (const arg of args) {
          walk(arg, {
            Identifier(ident) {
              if (!params.includes(ident.name)) return
              if (i === parent.indexArgument) {
                indexArg = params.indexOf(ident.name)
              } else if (i === parent.keyArgument) {
                keyArg = params.indexOf(ident.name)
              }
            },
            BinaryExpression(bx) {
              let num = NaN
              if (i !== parent.indexArgument) return
              if (
                Guard.isUnaryExpression(bx.left) ||
                Guard.isLiteralNumeric(bx.left) ||
                Guard.isLiteralString(bx.left)
              ) {
                num = literalOrUnaryExpressionToNumber(bx.left, true)
              } else if (
                Guard.isUnaryExpression(bx.right) ||
                Guard.isLiteralNumeric(bx.right) ||
                Guard.isLiteralString(bx.right)
              ) {
                num = literalOrUnaryExpressionToNumber(bx.right, true)
              }
              if (isNaN(num)) return
              if (bx.operator === '-') num = num * -1
              offset = num
            },
          })
          ++i
        }
        if (context.stringDecoderReferences.find((i) => i.identifier === fnId))
          return
        context.stringDecoderReferences.push({
          identifier: fnId,
          realIdentifier: parent.identifier,
          additionalOffset: offset,
          indexArgument: indexArg,
          keyArgument: keyArg,
        })
        newRefsFound++
        if (context.removeGarbage) {
          ;(node as any).type = 'EmptyStatement'
        }
        context.log(
          'Found func ref id =',
          fnId,
          'offset =',
          offset,
          'index =',
          indexArg,
          'key =',
          keyArg,
          'parent =',
          parent.identifier
        )
      },
    })
    return newRefsFound
  }

  // Decode everything
  decoder(context: Context) {
    const { util_decode, literals_to_arg_array } = this

    walk(context.ast, {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.arguments.length === 0 ||
          node.arguments.length > 5 ||
          node.arguments[0].type === 'SpreadElement'
        )
          return
        if (
          !node.arguments.every(
            (node) =>
              Guard.isUnaryExpressionNumeric(node) ||
              Guard.isLiteralNumeric(node) ||
              Guard.isLiteralString(node)
          )
        )
          return

        const name = node.callee.name

        if (name === 'parseInt') return
        try {
          let args = literals_to_arg_array(node.arguments)
          let val = util_decode(context, name, args)
          sp<Literal>(node, {
            type: 'Literal',
            value: val,
          })
        } catch (err: any) {
          if (err.toString().includes('no decoder')) return
          throw err
        }
        /*let foundRef = context.stringDecoderReferences.find(
          (ref) => ref.identifier === name
        )
        if (!foundRef) return // not a string decode call

        // foundRef is not undefined thank u TS
        let foundDec = context.stringDecoders.find(
          (dec) => dec.identifier === foundRef!.realIdentifier
        )
        if (!foundDec) return*/
      },
    })
    return this
  }

  public async transform(context: Context) {
    this.stringsFinder(context).funcFinder(context).stringsFinder(context)

    while (this.varReferenceFinder(context) > 0) {
      context.log('Searching for more variable references')
    }
    while (this.fnReferenceFinder(context) > 0) {
      context.log('Searching for more function references')
    }

    this.shiftFinder(context).shiftFinder2(context).decoder(context)

    context.log(
      'shifted =',
      context.shiftedArrays,
      'arrays =',
      context.stringArrays.length
    )
  }
}
