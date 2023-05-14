import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { NodePath } from '@babel/traverse'
import { evaluateTruthy } from '~/util/helpers'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'generic/deadcode': z.input<typeof schema>
    }
  }
}

function replaceIfStatement(p: NodePath<t.IfStatement>, stmt?: NodePath<t.Statement | null | undefined>) {
  if (!stmt || !stmt.isStatement()) {
    p.remove()
  } else if (stmt.isBlockStatement()) {
    const body = stmt.get('body')
    p.replaceWithMultiple(body.map(i => i.node))
  } else {
    p.replaceWith(stmt)
  }
}

export default createTransformer('generic/deadcode', {
  schema,

  run(ctx) {
    ctx.traverse({
      IfStatement(p) {
        // Remove dead-code (consequent/alternate branch) from if statements (if the test condition can be evaluated confidently)
        const test = p.get('test')
        const consequent = p.get('consequent')
        const alternate = p.get('alternate')

        const evaluated = evaluateTruthy(test)
        if (evaluated === true) {
          replaceIfStatement(p, consequent)
        } else if (evaluated === false) {
          replaceIfStatement(p, alternate)
        }
      },
      ConditionalExpression(p) {
        // Remove dead-code (consequent/alternate branch) from ternary statements (if the test condition can be evaluted confidently)
        const test = p.get('test')
        const consequent = p.get('consequent')
        const alternate = p.get('alternate')

        const evaluated = evaluateTruthy(test)
        if (evaluated === true) {
          p.replaceWith(consequent)
        } else if (evaluated === false) {
          p.replaceWith(alternate)
        }
      },
    })
  },
})
