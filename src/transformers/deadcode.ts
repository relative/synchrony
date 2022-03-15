import { Transformer, TransformerOptions } from './transformer'
import { walk, findNodeAt } from '../util/walk'
import {
  Function,
  IfStatement,
  sp,
  VariableDeclaration,
  VariableDeclarator,
} from '../util/types'
import * as Guard from '../util/guard'
import Context from '../context'

export interface DeadCodeOptions extends TransformerOptions {}
export default class DeadCode extends Transformer<DeadCodeOptions> {
  constructor(options: Partial<DeadCodeOptions>) {
    super('DeadCode', options)
  }

  // flip alternate/consequent if test is FALSE
  flipIfStatements(context: Context) {
    walk(context.ast, {
      IfStatement(node) {
        if (!node.alternate) return

        if (!Guard.isLiteralBoolean(node.test) || node.test.value !== false)
          return

        if (
          Guard.isIfStatement(node.alternate) &&
          (!Guard.isLiteralBoolean(node.alternate.test) ||
            node.alternate.test.value !== true ||
            node.alternate.alternate)
        )
          return

        let cons = node.consequent,
          alt = Guard.isIfStatement(node.alternate)
            ? node.alternate.consequent
            : node.alternate

        node.test.value = !node.test.value
        sp<IfStatement>(node, {
          consequent: alt as any,
          alternate: cons as any,
        })
      },
    })
    return this
  }

  // remove alternates if test is TRUE
  removeDeadAlternates(context: Context) {
    walk(context.ast, {
      IfStatement(node) {
        if (!node.alternate) return
        if (!Guard.isLiteralBoolean(node.test) || node.test.value !== true)
          return
        if (Guard.isIfStatement(node.alternate)) return

        delete node.alternate
      },
    })
    return this
  }

  // move if (true) consequents to parent if no alternate flow
  fixIfStatements(context: Context) {
    walk(context.ast, {
      IfStatement(node, _, ancestors) {
        if (node.alternate) return
        if (!Guard.isLiteralBoolean(node.test) || node.test.value !== true)
          return

        let parent = ancestors[ancestors.length - 2]
        if (
          !Guard.isBlockStatement(parent) ||
          !Guard.isBlockStatement(node.consequent)
        )
          return

        let ourIdx = parent.body.findIndex(
          (n) =>
            n.type === node.type && n.start === node.start && n.end === node.end
        )
        parent.body.splice(ourIdx, 1, ...node.consequent.body)
      },
    })
    return this
  }

  // remove if(false), while(false)
  removeDead(context: Context) {
    walk(context.ast, {
      IfStatement(node, _, ancestors) {
        const parent = ancestors[ancestors.length - 2]
        if (!Guard.isBlockStatement(parent)) return
        if (
          !Guard.isLiteralBoolean(node.test) ||
          node.test.value ||
          node.alternate
        )
          return

        // dead

        let ourIdx = parent.body.findIndex(
          (e) =>
            e.type === node.type && e.start === node.start && e.end === node.end
        )
        parent.body.splice(ourIdx, 1)
      },
    })
    walk(context.ast, {
      WhileStatement(node, _, ancestors) {
        const parent = ancestors[ancestors.length - 2]
        if (!Guard.isBlockStatement(parent)) return
        if (!Guard.isLiteralBoolean(node.test) || node.test.value) return

        let ourIdx = parent.body.findIndex(
          (e) =>
            e.type === node.type && e.start === node.start && e.end === node.end
        )
        parent.body.splice(ourIdx, 1)
      },
    })
    return this
  }

  // remove dead variables (not assigned)
  removeDeadVariables(context: Context) {
    function visitor(func: Function) {
      const scope = context.scopeManager.acquire(func)
      if (!scope) return

      for (const v of scope.variables) {
        if (v.name === 'arguments') continue
        if (v.identifiers.length !== 1) continue // ?
        if (v.defs.length !== 1) continue // ?
        if (v.defs[0].type !== 'Variable') continue

        if (v.references.length === 0) {
          let def = v.defs[0]
          let node = def.node as VariableDeclarator
          let p = findNodeAt<VariableDeclaration>(
            func,
            def.parent.range!,
            'VariableDeclaration'
          )
          if (!p) continue // ?
          p.declarations = p.declarations.filter(
            (decl) => decl.start !== node.start && decl.end !== node.end
          )
          context.log('Removed dead variable', v.name)
        }
      }
    }

    walk(context.ast, {
      FunctionDeclaration: visitor,
      FunctionExpression: visitor,
      ArrowFunctionExpression: visitor,
    })
    return this
  }

  public async transform(context: Context) {
    this.flipIfStatements(context)
      .removeDeadAlternates(context)
      .fixIfStatements(context)
      .removeDead(context)
    //.removeDeadVariables(context)
  }
}
