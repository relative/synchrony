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
        return this.decodeSimple(context, index, offset)
      case DecoderFunctionType.BASE64:
        return this.decodeBase64(context, identifier, index, offset)
      case DecoderFunctionType.RC4:
        key = args[keyArg] as string
        return this.decodeRC4(context, identifier, index, key, offset)
      default:
        throw new TypeError('Invalid decoder function type')
    }
  }

  decodeSimple(context: Context, index: number, offset: number) {
    return context.stringArray[index + offset]
  }
  decodeBase64(
    context: Context,
    identifier: string, // grab the charset from our identifier
    index: number,
    offset: number
  ) {
    let str = context.stringArray[index + offset],
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
    let str = context.stringArray[index + offset],
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
        context.stringArray = (strArray.elements as StringLiteral[]).map(
          (e) => e.value
        )
        context.stringArrayIdentifier = fnId
        if (context.removeGarbage) {
          ;(node as any).type = 'EmptyStatement'
        }
        context.log(
          'Found string array at',
          fnId,
          '#',
          context.stringArray.length
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

        if (block.body.length > 3 && block.body.length < 2) return

        // stringArray declaration
        if (!Guard.isVariableDeclaration(block.body[0])) return
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

        if (
          block.body[0].declarations[0].init?.type !== 'CallExpression' ||
          block.body[0].declarations[0].init.callee.type !== 'Identifier' ||
          block.body[0].declarations[0].init.callee.name !==
            context.stringArrayIdentifier
        )
          return

        const body = fn.body.body as Statement[]
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
          offset: calcOffset,
          type: DecoderFunctionType.SIMPLE,
          indexArgument: 0,
          keyArgument: 1,
        } as DecoderFunction

        if (body.length >= 3) {
          // possibly B64/RC4 type decoder
          if (Guard.isIfStatement(body[2])) {
            // check for B64 charset
            if (
              Guard.isBlockStatement(body[2].consequent) &&
              body[2].consequent.body.length === 2 &&
              Guard.isVariableDeclaration(body[2].consequent.body[0]) &&
              Guard.isFunctionExpression(
                body[2].consequent.body[0].declarations[0].init!
              )
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
              Guard.isBlockStatement(body[2].consequent) &&
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
          'offset =',
          calcOffset,
          'type =',
          decFn.type
        )
      },
    })
    return this
  }

  // Locate push/shift pair inside IIFE
  shiftFinder(context: Context) {
    const { util_decode, literals_to_arg_array } = this
    // retn TRUE if remove .
    function visitor(node: Node) {
      if (
        !Guard.isCallExpression(node) ||
        node.callee.type !== 'FunctionExpression'
      )
        return false

      const body = node.callee.body.body,
        bRev = [...body].reverse()
      if (
        body.length < 2 ||
        //bRev[1].type !== 'VariableDeclaration' || // multiple wrappers break this check
        bRev[0].type !== 'WhileStatement' ||
        !Guard.isBlockStatement(bRev[0].body) ||
        bRev[0].body.body.length !== 1 ||
        bRev[0].body.body[0].type !== 'TryStatement' ||
        bRev[0].body.body[0].block.body.length !== 2 ||
        bRev[0].body.body[0].block.body[0].type !== 'VariableDeclaration'
      )
        return
      if (node.arguments[1].type !== 'Literal') return
      const breakCond = node.arguments[1].value

      const pic = bRev[0].body.body[0].block.body[0].declarations[0].init
      if (pic?.type !== 'BinaryExpression') return

      let st = new Simplify({})

      // String eval loop
      // push/shift should only have #size unique combinations I think
      let maxLoops = context.stringArray.length * 2,
        iteration = 0
      while (true) {
        iteration++
        if (iteration > maxLoops) {
          throw new Error(
            `Push/shift calculation failed (iter=${iteration}>maxLoops=${maxLoops})`
          )
        }
        // Classes suck
        const bpic = immutate(pic)
        let hasNaN = false

        context.stringArray.push(context.stringArray.shift() as string)

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
          node.arguments[0].type !== 'Literal' &&
          node.arguments[0].type !== 'UnaryExpression'
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
    this.stringsFinder(context).funcFinder(context)

    while (this.varReferenceFinder(context) > 0) {
      context.log('Searching for more variable references')
    }
    while (this.fnReferenceFinder(context) > 0) {
      context.log('Searching for more function references')
    }

    this.shiftFinder(context).decoder(context)
  }
}
