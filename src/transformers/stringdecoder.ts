import {
  Program,
  BlockStatement,
  sp,
  VariableDeclaration,
  ExpressionStatement,
  ReturnStatement,
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

import Context from '../context'
import { literalOrUnaryExpressionToNumber } from '../util/translator'
import Simplify from './simplify'

export interface StringDecoderOptions {}
export default class StringDecoder extends Transformer<StringDecoderOptions> {
  constructor(options: StringDecoderOptions) {
    super('StringDecoder', options)
  }

  decodeSimple(context: Context, index: number, offset: number) {
    return context.stringArray[index + offset]
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
        ;``
        // our offset in our code will always be ADDED to the index,
        // not subtracted.
        calcOffset = literalOrUnaryExpressionToNumber(
          body[0].expression.right.right
        )
        if (body[0].expression.right.operator === '-')
          calcOffset = calcOffset * -1

        context.stringDecoders.push({
          identifier: node.id.name,
          offset: calcOffset,
        })
        /*console.log(
          'Found decoder function',
          node.id?.name,
          'offset =',
          calcOffset
        )*/
      },
    })
    return this
  }

  // Locate push/shift pair inside IIFE
  shiftFinder(context: Context) {
    const { decodeSimple } = this
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

        // make finding identifiers that reference another ident into a
        // global utility method?
        const decoder = context.stringDecoders[0]
        const decFnId = (
          body[0].declarations.find(
            (d) =>
              d.init?.type === 'Identifier' &&
              d.init.name === decoder.identifier
          )?.id as Identifier
        ).name
        if (!decFnId) return

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
            console.log(
              'Push/shift calculation failed',
              `(iter=${iteration}>maxLoops=${maxLoops})`
            )
            break
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
                node.arguments[0].callee.name !== decFnId ||
                node.arguments[0].arguments.length !== 1
              )
                return
              if (node.arguments[0].arguments[0].type !== 'Literal') return
              let idx = node.arguments[0].arguments[0].value as number
              let val = parseInt(decodeSimple(context, idx, decoder.offset))
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
        if (
          node.declarations[0].init?.type !== 'Identifier' ||
          node.declarations[0].id.type !== 'Identifier'
        )
          return
        let refName = node.declarations[0].id.name,
          valName = node.declarations[0].init.name
        let foundDecoder = context.stringDecoders.find(
          (d) => d.identifier === valName
        )
        if (!foundDecoder) return
        context.stringDecoderReferences.push({
          identifier: refName,
          realIdentifier: valName,
          additionalOffset: 0,
        })
      },
    })
    return this
  }

  // Decode everything
  decoder(context: Context) {
    const { decodeSimple } = this

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
        let foundRef = context.stringDecoderReferences.find(
          (ref) => ref.identifier === name
        )
        if (!foundRef) return // not a string decode call

        // foundRef is not undefined thank u TS
        let foundDec = context.stringDecoders.find(
          (dec) => dec.identifier === foundRef!.realIdentifier
        )
        if (!foundDec) return

        let idx = node.arguments[0].value
        sp<Literal>(node, {
          type: 'Literal',
          value: decodeSimple(
            context,
            idx,
            foundDec.offset + foundRef.additionalOffset
          ),
        })
      },
    })
    return this
  }

  public async transform(context: Context) {
    this.stringsFinder(context)
      .funcFinder(context)
      .shiftFinder(context)
      .referenceFinder(context)
      .decoder(context)
  }
}
