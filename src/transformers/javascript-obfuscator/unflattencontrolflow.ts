import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { deepIsSwitchStatement, deepIsVariableDeclaration, deepIsWhileStatement } from 'generated:nodePathEquality'
import { ArrayMode, ae, es } from '~/util/equality'
import { getValueOfNode, literalOrUnaryExpressionToNumber } from '~/util/translator'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'javascript-obfuscator/unflattencontrolflow': z.input<typeof schema>
    }
  }
}

export default createTransformer('javascript-obfuscator/unflattencontrolflow', {
  schema,

  run(ctx) {
    ctx.traverse({
      BlockStatement(p) {
        const [vdO, vdI, wst] = p.get('body')
        const out = {} as {
          orderVar: string
          order: string
          orderSplit: string
          indexVar: string
          indexStart: t.Expression
        }
        if (
          !deepIsVariableDeclaration(
            vdO,
            {
              declarations: ae({
                items: [
                  {
                    type: 'VariableDeclarator',
                    id: t.identifier(es('orderVar')),
                    init: {
                      type: 'CallExpression',
                      callee: t.memberExpression(t.stringLiteral(es('order')), t.identifier('split')),
                      arguments: [t.stringLiteral(es('orderSplit'))],
                    },
                  },
                ],
                mode: ArrayMode.Exact,
              }),
            },
            out
          )
        )
          return
        if (
          !deepIsVariableDeclaration(
            vdI,
            {
              declarations: ae<t.VariableDeclarator>({
                items: [
                  {
                    type: 'VariableDeclarator',
                    id: t.identifier(es('indexVar')),
                    // @ts-expect-error shut up
                    init: es('indexStart'),
                  },
                ],
                mode: ArrayMode.Exact,
              }),
            },
            out
          )
        )
          return
        if (!t.isNumericLiteral(out.indexStart) && !t.isUnaryExpression(out.indexStart)) return

        if (
          !deepIsWhileStatement(wst, {
            test: t.booleanLiteral(true),
          })
        )
          return

        const wb = wst.get('body')
        if (!wb.isBlockStatement()) return
        const [sst, bst] = wb.get('body')

        if (
          !deepIsSwitchStatement(sst, {
            discriminant: t.memberExpression(
              t.identifier(out.orderVar),
              t.updateExpression('++', t.identifier(out.indexVar), false),
              true
            ),
          })
        )
          return
        if (!bst.isBreakStatement()) return

        const cases = sst.get('cases')

        const order = out.order.split(out.orderSplit)
        const index = literalOrUnaryExpressionToNumber(out.indexStart)

        const stmts: t.Statement[] = []

        for (let i = index; i < order.length; ++i) {
          const ord = order[i]
          if (typeof ord !== 'string') break
          const c = cases.find(c => {
            const test = c.get('test')
            if (!test.isStringLiteral()) return false
            return getValueOfNode(test) === ord
          })
          if (!c) break
          const consequent = c.get('consequent')
          if (!consequent.length) break
          if (!consequent[consequent.length - 1].isContinueStatement()) break
          stmts.push(...consequent.slice(0, -1).map(t => t.node))
        }
        p.replaceWith(t.blockStatement(stmts, p.node.directives))
      },
    })
  },
})
