import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { createFilterArray, zFilterArray } from '~/util/filter'
import { bindingIsReferenced } from '~/util/scope'

const schema = z.object({
  propInclude: zFilterArray().default(
    // Deduplicated keys from prototypes of [Number, String, Boolean, Function, Object, Array])
    // [...new Set([Number,String,Boolean,Function,Object,Array].map(n=>[...Object.getOwnPropertyNames(n), ...Object.getOwnPropertyNames(n.prototype)]).flat())]
    [
      'length',
      'name',
      'prototype',
      'isFinite',
      'isInteger',
      'isNaN',
      'isSafeInteger',
      'parseFloat',
      'parseInt',
      'MAX_VALUE',
      'MIN_VALUE',
      'NaN',
      'NEGATIVE_INFINITY',
      'POSITIVE_INFINITY',
      'MAX_SAFE_INTEGER',
      'MIN_SAFE_INTEGER',
      'EPSILON',
      'constructor',
      'toExponential',
      'toFixed',
      'toPrecision',
      'toString',
      'valueOf',
      'toLocaleString',
      'fromCharCode',
      'fromCodePoint',
      'raw',
      'anchor',
      'at',
      'big',
      'blink',
      'bold',
      'charAt',
      'charCodeAt',
      'codePointAt',
      'concat',
      'endsWith',
      'fontcolor',
      'fontsize',
      'fixed',
      'includes',
      'indexOf',
      'italics',
      'lastIndexOf',
      'link',
      'localeCompare',
      'match',
      'matchAll',
      'normalize',
      'padEnd',
      'padStart',
      'repeat',
      'replace',
      'replaceAll',
      'search',
      'slice',
      'small',
      'split',
      'strike',
      'sub',
      'substr',
      'substring',
      'sup',
      'startsWith',
      'trim',
      'trimStart',
      'trimLeft',
      'trimEnd',
      'trimRight',
      'toLocaleLowerCase',
      'toLocaleUpperCase',
      'toLowerCase',
      'toUpperCase',
      'isWellFormed',
      'toWellFormed',
      'arguments',
      'caller',
      'apply',
      'bind',
      'call',
      'assign',
      'getOwnPropertyDescriptor',
      'getOwnPropertyDescriptors',
      'getOwnPropertyNames',
      'getOwnPropertySymbols',
      'hasOwn',
      'is',
      'preventExtensions',
      'seal',
      'create',
      'defineProperties',
      'defineProperty',
      'freeze',
      'getPrototypeOf',
      'setPrototypeOf',
      'isExtensible',
      'isFrozen',
      'isSealed',
      'keys',
      'entries',
      'fromEntries',
      'values',
      '__defineGetter__',
      '__defineSetter__',
      'hasOwnProperty',
      '__lookupGetter__',
      '__lookupSetter__',
      'isPrototypeOf',
      'propertyIsEnumerable',
      '__proto__',
      'isArray',
      'from',
      'of',
      'copyWithin',
      'fill',
      'find',
      'findIndex',
      'findLast',
      'findLastIndex',
      'pop',
      'push',
      'reverse',
      'shift',
      'unshift',
      'sort',
      'splice',
      'join',
      'forEach',
      'filter',
      'flat',
      'flatMap',
      'map',
      'every',
      'some',
      'reduce',
      'reduceRight',
      'toReversed',
      'toSorted',
      'toSpliced',
      'with',
    ]
  ),
  propExclude: zFilterArray(),
})
declare global {
  namespace Synchrony {
    interface Transformers {
      'generic/staticvar': z.input<typeof schema>
    }
  }
}

export default createTransformer('generic/staticvar', {
  schema,

  run(ctx, opts) {
    const propFilter = createFilterArray(opts.propInclude, opts.propExclude)
    ctx.traverse({
      VariableDeclarator(p) {
        const id = p.get('id')
        const init = p.get('init')
        if (!id.isIdentifier()) return
        if (!init.isStringLiteral()) return

        if (!propFilter.isIncluded(init.node.value)) return

        p.scope.crawl()
        const bind = p.scope.getBinding(id.node.name)
        if (!bind) return
        if (!bind.constant) {
          // idk
          if (bind.path !== bind.constantViolations[0]) return
        }

        for (const ref of bind.referencePaths) {
          ref.replaceWith(init)
        }

        if (!bindingIsReferenced(bind)) {
          p.remove()
        }
      },
    })
  },
})
