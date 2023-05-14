import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { createLiteral } from '~/util/translator'

const schema = z.object({})

declare global {
  namespace Synchrony {
    interface Transformers {
      'generic/simplify': z.input<typeof schema>
    }
  }
}

export default createTransformer('generic/simplify', {
  schema,

  run(ctx) {
    ctx.traverse({
      UnaryExpression(p) {
        const arg = p.get('argument')
        // if (arg.isStringLiteral()) {
        //   if (arg.node.value.startsWith('0x') && p.node.operator === '-') {
        //     p.replaceWith(t.numericLiteral(unaryExpressionToNumber))
        //   }
        // }
        switch (p.node.operator) {
          case '!':
            {
              if (arg.isNumericLiteral() || arg.isArrayExpression() || arg.isBooleanLiteral()) {
                // Simplify minified booleans
                // !0     = true
                // !1     = false
                // ![]    = false
                // !false = true
                // !true  = false
                const evaluated = p.evaluate()
                if (evaluated.confident) {
                  const literal = createLiteral(evaluated.value)
                  if (literal) {
                    p.replaceWith(literal)
                  }
                }
              }
            }
            break
        }
      },

      BinaryExpression(p) {
        const lhs = p.get('left'),
          rhs = p.get('right'),
          oper = p.node.operator

        // Concatenate strings
        // `'a' + 'b'` -> `'ab'`
        if (oper === '+' && lhs.isStringLiteral() && rhs.isStringLiteral()) {
          p.replaceWith(t.stringLiteral(lhs.node.value + rhs.node.value))
          return
        }
      },

      // Convert single statements to block statements
      ForStatement(p) {
        if (!p.get('body').isBlockStatement()) p.get('body').replaceWith(t.blockStatement([p.get('body').node]))
      },
      ForOfStatement(p) {
        if (!p.get('body').isBlockStatement()) p.get('body').replaceWith(t.blockStatement([p.get('body').node]))
      },
      ForInStatement(p) {
        if (!p.get('body').isBlockStatement()) p.get('body').replaceWith(t.blockStatement([p.get('body').node]))
      },
      WhileStatement(p) {
        if (!p.get('body').isBlockStatement()) p.get('body').replaceWith(t.blockStatement([p.get('body').node]))
      },
      DoWhileStatement(p) {
        if (!p.get('body').isBlockStatement()) p.get('body').replaceWith(t.blockStatement([p.get('body').node]))
      },
      IfStatement(p) {
        if (!p.get('consequent').isBlockStatement())
          p.get('consequent').replaceWith(t.blockStatement([p.get('consequent').node]))

        // p.alternate is checked
        if (p.has('alternate') && !p.get('alternate')!.isBlockStatement())
          p.get('alternate').replaceWith(t.blockStatement([p.get('alternate').node!]))
      },
    })
  },
})
