import {
  ArrowFunctionExpression,
  BlockStatement,
  FunctionExpression,
  Identifier,
  Node,
  Function,
  VariableDeclarator,
  sp,
} from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import Context from '../context'
import { Scope } from '../scope'
import { addLeadingCommentToNode } from '../util/helpers'

export interface RenameOptions extends TransformerOptions {}
export default class Rename extends Transformer<RenameOptions> {
  constructor(options: Partial<RenameOptions>) {
    super('Rename', options)
  }

  getParentFunction = (ancestors: Node[]): Function => {
    let pn = ancestors[ancestors.length - 2]
    if (
      !Guard.isFunctionExpression(pn) &&
      !Guard.isArrowFunctionExpression(pn) &&
      !Guard.isFunctionDeclaration(pn)
    )
      throw new TypeError('Parent is not function')
    return pn
  }

  inferNameByDeclarator = (decl: VariableDeclarator): string | void => {
    // check for require()... etc
  }
  findParameters = (block: BlockStatement, scope: Scope, ancestors: Node[]) => {
    let parent: Function
    try {
      parent = this.getParentFunction(ancestors)
    } catch (err) {
      return
    }

    for (const p of parent.params) {
      let ident: Identifier
      switch (p.type) {
        case 'RestElement':
          ident = p.argument as Identifier
          break
        case 'Identifier':
          ident = p
          break
        default:
          continue
      }
      scope.createParameter(ident.name, ident)
    }
  }
  findVariables = (
    context: Context,
    block: BlockStatement,
    scope: Scope,
    ancestors: Node[]
  ) => {
    walk(block, {
      VariableDeclaration(vd, _, anc) {
        let varBlock = [...anc]
          .reverse()
          .find((n) => n.type === 'BlockStatement') as BlockStatement
        if (!varBlock) return
        let varScope = context.scopes.getScopeByBlock(varBlock)
        if (varScope.start !== scope.start) {
          return
        }
        let pScope: Scope = varScope
        while (pScope.parent) {
          if (pScope.parent.global) break
          pScope = pScope.parent
        }

        for (const decl of vd.declarations) {
          if (!Guard.isIdentifier(decl.id)) continue

          //addLeadingCommentToNode(vd, 'Line', ` decl in ${varScope.id}`)
          try {
            let v = varScope.createVariable(vd.kind, decl.id.name, decl.id)
            decl.id.name = v.updateName(pScope.counter.next('v'))
          } catch (err) {}
        }
      },
    })
  }

  findGlobalVars = (context: Context) => {
    const scope = context.scopes.getGlobal()
    for (const n of context.ast.body) {
      if (Guard.isVariableDeclaration(n)) {
        for (const decl of n.declarations) {
          if (!Guard.isIdentifier(decl.id)) continue

          try {
            let v = scope.createVariable(n.kind, decl.id.name, decl.id)
            decl.id.name = v.updateName(scope.counter.next('g'))
          } catch (err) {}
        }
      }
    }
  }

  createScopes(context: Context) {
    const { findParameters, findVariables } = this
    walk(context.ast, {
      BlockStatement(block, _, ancestors) {
        let scope = context.scopes.createScope(block, ancestors)
        findParameters(block, scope, ancestors)
        findVariables(context, block, scope, ancestors)

        //addLeadingCommentToNode(block, 'Line', ` scope = ${scope.id}`)
      },
    })
    this.findGlobalVars(context)
    return this
  }

  rename(context: Context) {
    function renameIdentifier(id: Identifier, ancestors: Node[]) {
      try {
        let varBlock = [...ancestors]
          .reverse()
          .find(
            (n) => n.type === 'BlockStatement' || n.type === 'Program'
          ) as BlockStatement
        if (!varBlock) return

        let varScope = context.scopes.getScopeByBlock(varBlock)

        let v = varScope.findVariableByName(id.name)

        id.name = v.name
      } catch (err) {}
    }

    walk(context.ast, {
      // TODO: check acorn-walk base visitors for more "Pattern" overrides
      Identifier(id, _, ancestors) {
        renameIdentifier(id, ancestors)
      },
      AssignmentExpression(ae, _, ancestors) {
        if (!Guard.isIdentifier(ae.left)) return
        renameIdentifier(ae.left, ancestors)
      },
    })
  }

  public async transform(context: Context) {
    this.createScopes(context).rename(context)
  }
}
