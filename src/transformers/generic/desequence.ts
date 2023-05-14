import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { NodePath } from '@babel/traverse'
import { toStatement } from '~/util/translator'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'generic/desequence': z.input<typeof schema>
    }
  }
}

const CantSolveStatements = Symbol('CantSolveStatements')

function createStatementsFromExpressions(expressions: NodePath<t.Expression>[]): t.Statement[] {
  return expressions.map(({ node }) => toStatement(node))
}

export default createTransformer('generic/desequence', {
  schema,

  run(ctx) {
    ctx.traverse({
      SequenceExpression(p) {
        const parent = p.parentPath
        const expressions = p.get('expressions')
        if (expressions.length === 1) {
          throw 'is this even possible ? ? ? ? ? ? ?'
        }
        try {
          if (parent.isExpressionStatement()) {
            const statements = createStatementsFromExpressions(expressions)
            parent.insertBefore(statements)
            parent.remove()
          } else if (parent.isReturnStatement()) {
            const [last] = expressions.splice(-1)
            const statements = createStatementsFromExpressions(expressions)
            parent.set('argument', last.node)
            parent.insertBefore(statements)
          }
        } catch (err) {
          if (err !== CantSolveStatements) throw err
        }
      },
    })
  },
})
