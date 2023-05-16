import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { removeDeadCode } from '~/public/deadCode'
import { willPathMaybeExecuteBeforeAllNodes } from '~/util/helpers'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'jsconfuser/unmangle': z.input<typeof schema>
    }
  }
}

/**
 * Removes garbage arguments from functions when they are never called with them defined
 *
 * Additionally if the above is true replaces defaulted parameters in the function with their values
 */
export default createTransformer('jsconfuser/unmangle', {
  schema,

  run(ctx) {
    ctx.path.scope.crawl()
    ctx.traverse({
      FunctionDeclaration(p) {
        let params = p.get('params')
        if (params.length === 0) return
        const [identifier] = Object.keys(p.getOuterBindingIdentifiers())

        let changedAnything = false
        let iter = 0
        do {
          changedAnything = false
          const bind = p.scope.getBinding(identifier)
          if (!bind) return
          if (!bind.referenced) return

          ctx.log.debug('Iter', ++iter, 'for', identifier)

          let lastParamUsed = 0

          const allCallExpressions = bind.referencePaths.every(ref => {
            if (ref.key !== 'callee') return false
            const cx = ref.parentPath
            if (!cx?.isCallExpression()) return false

            const { length } = cx.get('arguments')
            if (length > lastParamUsed) {
              ctx.log.debug(cx.toString())
              lastParamUsed = length
            }
            return true
          })

          if (!allCallExpressions) return

          if (lastParamUsed === params.length) return
          ctx.log.debug('Processing', identifier, 'params length =', params.length, 'lastParamUsed =', lastParamUsed)

          const vd = t.variableDeclaration('let', [])
          for (let i = params.length - 1; i >= lastParamUsed; --i) {
            const p = params[i]
            // ctx.log.debug(i, 'fixed', p.toString())
            if (p.isAssignmentPattern()) {
              const id = p.get('left')
              const value = p.get('right')
              if (!id.isIdentifier()) break
              vd.declarations.push(t.variableDeclarator(id.node, value.node))
              p.remove()
            } else if (p.isIdentifier()) {
              vd.declarations.push(t.variableDeclarator(p.node, t.identifier('undefined')))
              p.remove()
            } else {
              break
            }
          }

          if (vd.declarations.length) {
            const [f] = p.get('body').get('body')
            if (!f) return
            f.insertBefore(vd)
          }
          params = p.get('params')
          ctx.log.debug('New params length =', params.length)

          p.scope.crawl()

          for (const decl of vd.declarations) {
            if (!t.isIdentifier(decl.id)) continue
            if (!decl.init) continue
            const db = p.scope.getBinding(decl.id.name)
            if (!db) continue
            for (const ref of db.referencePaths) {
              const canReplace = db.constant ? true : willPathMaybeExecuteBeforeAllNodes(ref, db.constantViolations)
              if (canReplace) {
                ctx.log.debug(`Replacing ${decl.id.name} with`, decl.init.type)
                ref.replaceWith(decl.init)
                changedAnything = true
              }
            }
          }

          removeDeadCode(p)
          bind.scope.crawl()
        } while (changedAnything)
      },
    })
  },
})
