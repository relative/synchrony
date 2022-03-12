import {
  NumericLiteral,
  Literal,
  sp,
  NumericUnaryExpression,
  BinaryOperator,
  Node,
  Identifier,
  BlockStatement,
  Program,
  Function,
} from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { findNodeAt, walk } from '../util/walk'
import * as Guard from '../util/guard'

import Context from '../context'
import { Scope } from 'eslint-scope'
import MersenneTwister from 'mersenne-twister'
import { generateRandomWords } from '../util/words'

type DefinitionType =
  | 'CatchClause'
  | 'ClassName'
  | 'FunctionName'
  | 'ImplicitGlobalVariable'
  | 'ImportBinding'
  | 'Parameter'
  | 'TDZ'
  | 'Variable'

export interface RenameOptions extends TransformerOptions {}
export default class Rename extends Transformer<RenameOptions> {
  mt!: MersenneTwister
  constructor(options: Partial<RenameOptions>) {
    super('Rename', options)
  }

  getVarPrefix = (type: DefinitionType): string => {
    switch (type) {
      case 'FunctionName':
        return 'func'
      case 'Parameter':
        return 'arg'
      default:
        return 'var'
    }
  }
  getUpperScope = (scope: Scope): Scope | undefined => {
    let upper = scope.upper
    if (!upper) return scope
    if (upper.type === 'global') return scope
    while (upper?.upper?.type !== 'global') {
      upper = upper?.upper!
    }
    return upper
  }
  scopeVisitor = (context: Context, scope: Scope) => {
    let renamed = new Map<string, string>()
    let upperScope = this.getUpperScope(scope)
    if (!upperScope) return // ?

    for (const v of scope.variables) {
      if (v.name === 'arguments') continue
      let newName =
        this.getVarPrefix(v.defs[0].type) +
        generateRandomWords(this.mt, 2).join('')
      renamed.set(v.name, newName)
      for (const def of v.defs) {
        let ident = findNodeAt<Identifier>(
          context.ast,
          def.name.range!,
          'Identifier'
        )
        if (!ident) continue
        ident.name = newName
      }
      for (const ref of v.references) {
        let ident = findNodeAt<Identifier>(
          context.ast,
          ref.identifier.range!,
          'Identifier'
        )
        if (!ident) continue
        ident.name = newName
      }
      v.name = newName
    }

    for (const ref of scope.references) {
      let ident = findNodeAt<Identifier>(
        context.ast,
        ref.identifier.range!,
        'Identifier'
      )
      if (!ident) continue
      if (renamed.has(ident.name)) ident.name = renamed.get(ident.name)!
    }
  }

  public async rename(context: Context) {
    this.mt = new MersenneTwister(context.hash)
    for (const scope of context.scopeManager.scopes) {
      this.scopeVisitor(context, scope)
    }
    return this
  }

  public async transform(context: Context) {
    this.rename(context)
  }
}
