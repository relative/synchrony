import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { createLiteral } from '~/util/translator'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'generic/foldconstants': z.input<typeof schema>
    }
  }
}

export default createTransformer('generic/foldconstants', {
  schema,

  run(ctx) {
    ctx.traverse({
      UnaryExpression(p) {
        const evaluated = p.evaluate()
        if (evaluated.confident) {
          const node = createLiteral(evaluated.value)
          if (node) {
            p.replaceWith(node)
          }
        }
      },
      BinaryExpression(p) {
        const evaluated = p.evaluate()
        if (evaluated.confident) {
          const node = createLiteral(evaluated.value)
          if (node) {
            p.replaceWith(node)
          }
        }
      },
    })
  },
})
