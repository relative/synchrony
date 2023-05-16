import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { foldConstants } from '~/public/foldConstants'

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
    foldConstants(ctx)
  },
})
