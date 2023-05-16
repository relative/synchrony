import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { removeDeadCode } from '~/public/deadCode'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'generic/deadcode': z.input<typeof schema>
    }
  }
}

export default createTransformer('generic/deadcode', {
  schema,

  run(ctx) {
    removeDeadCode(ctx)
  },
})
