import {
  Program,
  BlockStatement,
  sp,
  VariableDeclaration,
  ExpressionStatement,
  ReturnStatement,
  CallExpression,
  StringLiteral,
  Identifier,
  Statement,
  Literal,
  UnaryExpression,
} from '../util/types'
import Transformer from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import { immutate } from '../util/helpers'

import Context, {
  DecoderFunction,
  DecoderFunctionBase64,
  DecoderFunctionType,
  DecoderReference,
} from '../context'
import { literalOrUnaryExpressionToNumber } from '../util/translator'
import Simplify from './simplify'

export interface StringDecoderOptions {}
export default class StringDecoder extends Transformer<StringDecoderOptions> {
  constructor(options: StringDecoderOptions) {
    super('StringDecoder', options)
  }

  private util_b64_decode(chars: string, str: string): string {
    let buf = '',
      i = 0
    while (i < str.length) {
      let c = [
        chars.indexOf(str.charAt(i++)),
        chars.indexOf(str.charAt(i++)),
        chars.indexOf(str.charAt(i++)),
        chars.indexOf(str.charAt(i++)),
      ]
      let x = ((c[0] & 0x3f) << 2) | ((c[1] >> 4) & 0x3),
        y = ((c[1] & 0xf) << 4) | ((c[2] >> 2) & 0xf),
        z = ((c[2] & 0x3) << 6) | (c[3] & 0x3f)
      buf +=
        String.fromCharCode(x) +
        (y ? String.fromCharCode(y) : '') +
        (z ? String.fromCharCode(z) : '')
    }
    return buf
  }
  private util_decode = (
    context: Context,
    identifier: string,
    index: number
  ) => {
    // """type safety"""
    let decoder: DecoderFunction,
      offset = 0,
      decRef = -1
    let predicate = (dec: DecoderFunction | DecoderReference) =>
      dec.identifier === identifier
    if (context.stringDecoders.findIndex(predicate) !== -1) {
      decoder = context.stringDecoders.find(predicate)!
    } else if (
      (decRef = context.stringDecoderReferences.findIndex(predicate)) !== -1
    ) {
      identifier = context.stringDecoderReferences[decRef].realIdentifier
      offset += context.stringDecoderReferences[decRef].additionalOffset
      decoder = context.stringDecoders.find(predicate)!
    } else {
      throw new TypeError(
        `Failed to decode ${identifier}(${index}, ${offset}), no decoder`
      )
    }
    offset += decoder.offset
    switch (decoder.type) {
      case DecoderFunctionType.SIMPLE:
        return this.decodeSimple(context, index, offset)
      case DecoderFunctionType.BASE64:
        return this.decodeBase64(context, identifier, index, offset)
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

        /*console.log(
          'Found string array at',
          fnId,
          '#',
          context.stringArray.length
        )*/
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

        if (block.body.length !== 2) return
        if (!Guard.isVariableDeclaration(block.body[0])) return
        if (
          !Guard.isReturnStatement(block.body[1]) ||
          block.body[1].argument?.type !== 'SequenceExpression' ||
          block.body[1].argument.expressions.length !== 2 ||
          block.body[1].argument.expressions[0].type !==
            'AssignmentExpression' ||
          block.body[1].argument.expressions[0].left.type !== 'Identifier' ||
          block.body[1].argument.expressions[0].left.name !== fnId ||
          block.body[1].argument.expressions[0].right.type !==
            'FunctionExpression' ||
          block.body[1].argument.expressions[1].type !== 'CallExpression'
          // check callexp callee and args?
        )
          return
        if (
          block.body[0].declarations[0].init?.type !== 'CallExpression' ||
          block.body[0].declarations[0].init.callee.type !== 'Identifier' ||
          block.body[0].declarations[0].init.callee.name !==
            context.stringArrayIdentifier
        )
          return
        const fn = block.body[1].argument.expressions[0].right,
          fnParams = (fn.params as Identifier[]).map((id) => id.name)
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
        } as DecoderFunction

        if (body.length >= 3) {
          // possibly B64 type decoder
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
            }
          }
        }

        context.stringDecoders.push(decFn)
        /*console.log(
          'Found decoder function',
          node.id?.name,
          'offset =',
          calcOffset,
          'type =',
          decFn.type
        )*/
      },
    })
    return this
  }

  // Locate push/shift pair inside IIFE
  shiftFinder(context: Context) {
    const { util_decode } = this
    walk(context.ast, {
      ExpressionStatement(node) {
        if (
          !Guard.isCallExpression(node.expression) ||
          node.expression.callee.type !== 'FunctionExpression'
        )
          return

        const body = node.expression.callee.body.body
        if (
          body.length !== 2 ||
          body[0].type !== 'VariableDeclaration' ||
          body[1].type !== 'WhileStatement' ||
          !Guard.isBlockStatement(body[1].body) ||
          body[1].body.body.length !== 1 ||
          body[1].body.body[0].type !== 'TryStatement' ||
          body[1].body.body[0].block.body.length !== 2 ||
          body[1].body.body[0].block.body[0].type !== 'VariableDeclaration'
        )
          return

        if (node.expression.arguments[1].type !== 'Literal') return
        const breakCond = node.expression.arguments[1].value

        const pic = body[1].body.body[0].block.body[0].declarations[0].init
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
              let decRef = -1
              if (
                node.arguments.length !== 1 ||
                node.arguments[0].type !== 'CallExpression' ||
                node.arguments[0].callee.type !== 'Identifier' ||
                /*(decRef = context.stringDecoderReferences.findIndex(
                  // typescript wtf
                  (d) =>
                    d.identifier ===
                    (
                      (node.arguments[0] as CallExpression)
                        .callee! as Identifier
                    ).name
                )) === -1 ||*/
                node.arguments[0].arguments.length !== 1
              )
                return
              if (node.arguments[0].arguments[0].type !== 'Literal') return
              let idx = node.arguments[0].arguments[0].value as number
              let val = -1
              try {
                val = parseInt(
                  util_decode(context, node.arguments[0].callee.name, idx)
                )
              } catch (err) {
                return
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

        /*console.log(
          'Found push/shift IIFE decFnId =',
          decFnId,
          'breakCond =',
          breakCond
        )*/
      },
    })
    return this
  }

  // Scan for references to the decoder functions
  referenceFinder(context: Context) {
    walk(context.ast, {
      VariableDeclaration(node) {
        for (const decl of node.declarations) {
          if (decl.init?.type !== 'Identifier' || decl.id.type !== 'Identifier')
            return
          let refName = decl.id.name,
            valName = decl.init.name
          let foundDecoder = context.stringDecoders.find(
            (d) => d.identifier === valName
          )
          if (!foundDecoder) return
          //console.log('REF found', refName, valName)
          context.stringDecoderReferences.push({
            identifier: refName,
            realIdentifier: valName,
            additionalOffset: 0,
          })
        }
      },
    })
    return this
  }

  // Decode everything
  decoder(context: Context) {
    const { util_decode } = this

    walk(context.ast, {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.arguments.length !== 1 ||
          node.arguments[0].type === 'SpreadElement' ||
          !Guard.isLiteralNumeric(node.arguments[0])
        )
          return

        const name = node.callee.name
        try {
          let idx = node.arguments[0].value
          let val = util_decode(context, name, idx)
          sp<Literal>(node, {
            type: 'Literal',
            value: val,
          })
        } catch (err) {
          return
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
    this.stringsFinder(context)
      .funcFinder(context)
      .referenceFinder(context)
      .shiftFinder(context)
      .decoder(context)
  }
}
