import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { bindingIsReferenced } from '~/util/scope'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'generic/deproxify': z.input<typeof schema>
    }
  }
}

export default createTransformer('generic/deproxify', {
  schema,

  run(ctx) {
    ctx.traverse({
      Function(p) {
        //   function fn1(a1, a2, a3) { console.log(a1, a2, a3); }
        //   function fn2(a1, a2, a3) { return fn1(a3, a1, a2); }
        //   fn2(32, 18, 19) = fn1(19, 32, 18)
        const block = p.get('body')
        if (!block.isBlockStatement()) return
        const body = block.get('body')
        if (body.length !== 1) return

        const retn = body[0]
        if (!retn.isReturnStatement()) return
        const cx = retn.get('argument')
        if (!cx.isExpression()) return
        // if (!cx.isCallExpression()) return

        const params = p.get('params').map(i => i.isIdentifier() && i.node.name)

        const identifiers = p.getOuterBindingIdentifiers()
        for (const name in identifiers) {
          const binding = p.scope.getBinding(name)
          if (!binding) continue
          if (!binding.references) continue
          ctx.log.debug(`${name} is referenced ${binding.references} times`)

          for (const ref of binding.referencePaths) {
            const parent = ref.parentPath
            if (!parent) continue
            if (parent.isCallExpression()) {
              const refParams = parent.get('arguments')
              const cn = t.cloneNode(cx.node)
              ctx.log.debug(`Replacing call \`${parent.getSource()}\``)
              t.traverseFast(cn, node => {
                if (node.type === 'Identifier') {
                  const paramIndex = params.indexOf(node.name)
                  if (paramIndex === -1) return
                  const foundParam = refParams.at(paramIndex)
                  if (!foundParam) throw new Error("Can't solve proxy function, function depends on scoped identifier")
                  ctx.log.debug(`Replacing identifier ${node.name} with \`${foundParam.getSource()}\``)
                  Object.assign(node, foundParam.node)
                }
              })
              parent.replaceWith(cn)
            }
          }
        }
        // need to recrawl scope to get rid of any danglign refs after being replaced
        ;(p.scope.parent || p.scope)?.crawl()

        // remove if no longer referenced by any other functions
        for (const name in identifiers) {
          const binding = p.scope.getBinding(name)
          if (binding?.referenced) continue
          ctx.log.debug(`Removing proxy function ${name} (no more references)`)
          p.remove()
        }
      },
      VariableDeclarator(p) {
        // Replaces variables that reference another variable with the other variable
        //    const a = 1234
        //    const b = a
        //    console.log(b)
        // is turned to
        //    const a = 1234
        //    console.log(a)

        const id = p.get('id'),
          init = p.get('init')
        if (!id.isIdentifier() || !init.isIdentifier()) return
        const bind = p.scope.getBinding(id.node.name)
        if (!bind?.constant) return
        for (const ref of bind.referencePaths) {
          if (!ref.isIdentifier()) continue
          ref.replaceWith(init)
        }
        if (!bindingIsReferenced(bind)) {
          p.remove()
        }
        // debugger
      },
    })
  },
})
