import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { Binding, NodePath } from '@babel/traverse'
import { deepIsFunctionDeclaration, deepIsFunctionExpression } from 'generated:nodePathEquality'
import { ArrayMode, ae, es } from '~/util/equality'
import generate from '@babel/generator'
import { bindingIsReferenced } from '~/util/scope'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'jsconfuser/constants': z.input<typeof schema>
    }
  }
}

export default createTransformer('jsconfuser/constants', {
  schema,

  run(ctx) {
    // Find and replace constant array
    const bindings = ctx.path.scope.getAllBindings() as Record<string, Binding>
    for (const arrayName of Object.keys(bindings)) {
      const bind = bindings[arrayName]
      const vd = bind.path

      if (vd.isVariableDeclarator() && bind.constant) {
        const init = vd.get('init')
        if (!init.isCallExpression()) continue
        const callee = init.get('callee')
        if (!callee.isIdentifier()) continue
        const fb = init.scope.getBinding(callee.node.name)
        if (!fb) continue
        if (!fb.path.isFunctionDeclaration()) continue

        const out = {} as { elements: (t.SpreadElement | t.Expression)[] }
        if (
          !deepIsFunctionDeclaration(
            fb.path,
            {
              body: {
                type: 'BlockStatement',
                // @ts-expect-error shh
                body: ae({
                  items: [
                    {
                      type: 'ReturnStatement',
                      argument: {
                        type: 'ArrayExpression',
                        // @ts-expect-error shh
                        elements: es('elements'),
                      },
                    },
                  ],
                  mode: ArrayMode.Exact,
                }),
              },
            },
            out
          )
        )
          continue

        if (out.elements.some(n => !t.isLiteral(n) && !t.isIdentifier(n))) continue
        init.replaceWith(t.arrayExpression(out.elements))

        const tmp = t.binaryExpression('==', t.identifier('_'), t.numericLiteral(0))
        for (const ref of bind.referencePaths) {
          const fx = ref.scope.path
          const ofx = {} as { keyId: string; prop: t.Expression }
          if (
            !deepIsFunctionExpression(
              fx,
              {
                params: [t.identifier(es('keyId'))],
                body: {
                  // @ts-expect-error shh
                  body: ae({
                    items: [
                      {
                        type: 'ReturnStatement',
                        argument: {
                          type: 'MemberExpression',
                          object: t.identifier(arrayName),
                          computed: true,
                          // @ts-expect-error shh
                          property: es('prop'),
                        },
                      },
                    ],
                    mode: ArrayMode.Exact,
                  }),
                },
              },
              ofx
            )
          )
            continue
          if (!t.isExpression(ofx.prop)) continue

          const vd = fx.parentPath
          if (!vd.isVariableDeclarator()) continue
          const id = vd.get('id')
          if (!id.isIdentifier()) continue
          const { name } = id.node
          const refBind = ref.scope.getBinding(name)
          if (!refBind) continue
          if (!refBind.constant) continue
          if (!refBind.referenced) continue
          for (const ref of refBind.referencePaths) {
            const cx = ref.parentPath
            if (!cx?.isCallExpression()) continue
            const cxArgs = cx.get('arguments')
            if (cxArgs.length !== 1) continue
            const [key] = cxArgs
            const prop = t.cloneDeepWithoutLoc(ofx.prop)
            t.traverseFast(prop, n => {
              if (t.isIdentifier(n)) {
                if (n.name === ofx.keyId) {
                  Object.assign(n, key.node)
                }
              }
            })
            tmp.right = prop
            cx.replaceWith(prop)
            const result = cx.evaluate()
            if (!result.confident) continue
            if (typeof result.value !== 'number') continue
            if (result.value > out.elements.length || result.value < 0) continue
            cx.replaceWith(out.elements[result.value])
          }
          // Remove string array fetcher function
          if (!bindingIsReferenced(refBind)) {
            refBind.path.remove()
          }
        }

        // Remove array variable
        if (!bindingIsReferenced(bind)) {
          bind.path.remove()
        }

        // Remove array function
        if (!bindingIsReferenced(fb)) {
          fb.path.remove()
        }
      }
    }
  },
})
