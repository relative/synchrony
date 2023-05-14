import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'generic/dememberize': z.input<typeof schema>
    }
  }
}

/**
 * Converts computed static MemberExpressions to MemberExpressions with Identifier properties
 *
 * object['property'] = object.property
 * object['01234']    = object['01234'] // Because 01234 is not a valid Identifier
 */
export default createTransformer('generic/dememberize', {
  schema,

  run(ctx) {
    ctx.traverse({
      MemberExpression(p) {
        if (p.node.computed) {
          const property = p.get('property')
          if (property.isStringLiteral()) {
            const { value: name } = property.node
            if (t.isValidIdentifier(name)) {
              p.node.computed = false
              property.replaceWith(t.identifier(name))
            }
          }
        }
      },
    })
  },
})
