import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { deepIsCallExpression } from 'generated:nodePathEquality'
import { ArrayMode, ae, es } from '~/util/equality'
import { Scope } from '@babel/traverse'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'jsconfuser/fixer': z.input<typeof schema>
    }
  }
}

export default createTransformer('jsconfuser/fixer', {
  schema,

  run(ctx) {
    const scopes = new Set<Scope>()

    ctx.traverse({
      CallExpression(p) {
        // function() { return function(a1){} }() = function(a1){}
        const callee = p.get('callee')
        if (callee.isFunctionExpression()) {
          const args = p.get('arguments')
          if (args.length !== 0) return
          const body = callee.get('body').get('body')
          if (body.length !== 1) return
          const [retn] = body
          if (!retn.isReturnStatement()) return
          const arg = retn.get('argument')
          if (!arg.isFunctionExpression()) return
          p.replaceWith(arg)
          p.scope.crawl()
          return
        }

        // x.call(this, a1, a2, a3)    = x(a1, a2, a3)
        // y.apply(this, [a1, a2, a3]) = y(a1, a2, a3)
        const out = {} as {
          object: string
          property: string
        }
        if (
          !deepIsCallExpression(
            p,
            {
              callee: {
                type: 'MemberExpression',
                object: t.identifier(es('object')),
                computed: false,
                property: t.identifier(es('property')),
              },
              arguments: ae({
                items: [t.thisExpression()],
                mode: ArrayMode.StartsWith,
              }),
            },
            out
          )
        )
          return
        // take off ThisExpression
        const args = p
          .get('arguments')
          .slice(1)
          .map(p => p.node)
        switch (out.property) {
          case 'call':
            p.replaceWith(t.callExpression(t.identifier(out.object), args))
            p.skip()
            scopes.add(p.scope)
            return
          case 'apply':
            if (!t.isArrayExpression(args[0])) return
            if (args[0].elements.some(n => !t.isExpression(n) && !t.isSpreadElement(n))) return
            p.replaceWith(
              t.callExpression(t.identifier(out.object), args[0].elements as (t.Expression | t.SpreadElement)[])
            )
            p.skip()
            scopes.add(p.scope)
            return
        }
      },
    })
    for (const scope of scopes) {
      scope.crawl()
    }
  },
})
