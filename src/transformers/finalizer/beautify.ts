import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'finalizer/beautify': z.input<typeof schema>
    }
  }
}

enum NumberRadix {
  Binary = 2,
  Octal = 8,
  Decimal = 10,
  Hexadecimal = 16,
}
const NumberPrefixes = {
  [NumberRadix.Binary]: '0b',
  [NumberRadix.Octal]: '0o',
  [NumberRadix.Decimal]: '',
  [NumberRadix.Hexadecimal]: '0x',
}
function numberToString(value: number, radix = NumberRadix.Decimal) {
  return NumberPrefixes[radix] + value.toString(radix)
}

const hexEscapeRegex = /(\\+)x([0-9A-Fa-f]{2})/g

const charactersToEscape = ['`', '"', "'"]

/**
 * Beautify parts of the resulting code
 */
export default createTransformer('finalizer/beautify', {
  schema,

  run(ctx) {
    ctx.traverse({
      NumericLiteral(p) {
        // Format numbers to a consistent radix
        // 0xabcd   = 43981
        // 0xffff   = 0xffff  (2^n - 1)
        // 0x10000  = 0x10000 (2^n)
        const { value, extra } = p.node
        if (extra) {
          let radix = NumberRadix.Decimal
          if (Number.isInteger(Math.log2(value)) || Number.isInteger(Math.log2(value + 1))) {
            radix = NumberRadix.Hexadecimal
          }

          extra.raw = numberToString(value, radix)
        }
      },
      StringLiteral(p) {
        const { extra } = p.node
        if (typeof extra?.raw === 'string') {
          extra.raw = extra.raw.replace(hexEscapeRegex, (m, backslashes: string[], code: string) => {
            if (backslashes.length % 2 === 0) return m
            const ascii = parseInt(code, 16)
            // only replace with printable ASCII characters (0x20 -> 0x7f)
            if (ascii < 0x20 /* SPC */ || ascii >= 0x7f /* DEL */) return m

            let str = String.fromCharCode(ascii)
            if (str === '\\') return m
            if (charactersToEscape.includes(str)) {
              str = '\\' + str
            }
            return str
          })
        }
      },
      EmptyStatement(p) {
        p.remove()
      },
    })
  },
})
