import { NodePath } from '@babel/traverse'
import { Context, getContext } from '~/context'
import { evaluateTruthy } from '~/util/helpers'
import * as t from '~/types'
import { bindingIsReferenced } from '../util/scope'

function replaceIfStatement(p: NodePath<t.IfStatement>, stmt?: NodePath<t.Statement | null | undefined>) {
  if (!stmt || !stmt.isStatement()) {
    p.remove()
  } else if (stmt.isBlockStatement()) {
    const body = stmt.get('body')
    p.replaceWithMultiple(body.map(i => i.node))
  } else {
    p.replaceWith(stmt)
  }
}

export function removeDeadCodeOnce(p: Context | NodePath): boolean {
  let updated = false
  const ctx = getContext(p)
  ctx.path.scope.crawl()
  p.traverse({
    IfStatement(p) {
      // Remove dead-code (consequent/alternate branch) from if statements (if the test condition can be evaluated confidently)
      const test = p.get('test')
      const consequent = p.get('consequent')
      const alternate = p.get('alternate')

      const evaluated = evaluateTruthy(test)
      if (evaluated === true) {
        replaceIfStatement(p, consequent)
        updated = true
      } else if (evaluated === false) {
        replaceIfStatement(p, alternate)
        updated = true
      }
    },
    ConditionalExpression(p) {
      // Remove dead-code (consequent/alternate branch) from ternary statements (if the test condition can be evaluted confidently)
      const test = p.get('test')
      const consequent = p.get('consequent')
      const alternate = p.get('alternate')

      const evaluated = evaluateTruthy(test)
      if (evaluated === true) {
        p.replaceWith(consequent)
        updated = true
      } else if (evaluated === false) {
        p.replaceWith(alternate)
        updated = true
      }
    },
    VariableDeclarator(p) {
      // Remove variables without references that shouldn't have side effects
      const id = p.get('id')
      if (!id.isIdentifier()) return
      const init = p.get('init')

      const bind = p.scope.getBinding(id.node.name)
      if (!bind) return

      if (bind.referenced) return
      if (!bind.constant) return

      if (init.isConstantExpression()) {
        ctx.log.debug(`removeDeadCode(): Removed variable declaration`, p.toString())
        p.remove()
        updated = true
      }
    },
    FunctionDeclaration(p) {
      // Remove functions that are never called or referenced
      const [identifier] = Object.keys(p.getOuterBindingIdentifiers())
      const bind = p.scope.getBinding(identifier)
      if (!bind) return
      if (!bindingIsReferenced(bind)) {
        ctx.log.debug(`removeDeadCode(): Removed function declaration`, identifier)
        p.remove()
        updated = true
      }
    },
  })
  return updated
}

export function removeDeadCode(p: Context | NodePath) {
  removeDeadCodeOnce(p)
  // whileGuard(removeDeadCodeOnce, 10, p)
}
