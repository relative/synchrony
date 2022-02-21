import Context from './context'
import { BlockStatement, Identifier, Node } from './util/types'

type VariableKind = 'var' | 'let' | 'const'

class NumberCounter {
  prefix = 'n'
  index = 0

  constructor(prefix?: string) {
    if (prefix) this.prefix = prefix
  }

  _next(): number {
    return this.index++
  }

  next(prefix?: string): string {
    return (prefix || this.prefix) + this._next()
  }
}

enum ScopeVariableType {
  Variable,
  Parameter,
}

class ScopeVariable {
  type: ScopeVariableType
  scope: Scope
  kind?: VariableKind

  oldName: string
  name: string
  start: number
  end: number

  constructor(
    scope: Scope,
    type: ScopeVariableType,
    name: string,
    identifier: Identifier
  ) {
    this.scope = scope
    this.type = type
    this.name = this.oldName = name

    this.start = identifier.start
    this.end = identifier.end
  }

  updateName(name: string) {
    this.oldName = this.name
    this.name = name

    return name
  }
}

export class Scope {
  id: string
  global = false

  private _parameters: ScopeVariable[]
  private _variables: ScopeVariable[]

  counter: NumberCounter

  parent?: Scope

  start?: number
  end?: number

  constructor(id: string, global?: boolean) {
    this.id = id
    if (typeof global === 'boolean') this.global = global

    this.counter = new NumberCounter()
    this._parameters = []
    this._variables = []
  }

  private variableExists(ident: Identifier) {
    return (
      this._variables.findIndex(
        (v) => v.start === ident.start && v.end === ident.end
      ) !== -1
    )
  }

  getVariableByIdent(ident: Identifier): ScopeVariable {
    let v = this._variables.find(
      (v) => v.start === ident.start && v.end === ident.end
    )
    if (!v) throw new Error('Variable does not exist for block')

    return v
  }

  findVariableByName(name: string): ScopeVariable {
    let v = this._variables.find((v) => v.name === name || v.oldName === name)
    if (!v) {
      let parent = this.parent
      while (parent) {
        v = parent._variables.find((v) => v.name === name || v.oldName === name)
        if (v) break
        parent = parent.parent
      }
    }
    if (!v) throw new Error('Variable does not exist')
    return v
  }

  createParameter(name: string, ident: Identifier) {
    this._parameters.push(
      new ScopeVariable(this, ScopeVariableType.Parameter, name, ident)
    )
  }

  createVariable(
    kind: VariableKind,
    name: string,
    ident: Identifier
  ): ScopeVariable {
    if (this.variableExists(ident)) throw new Error('Variable already exists')
    let v = new ScopeVariable(this, ScopeVariableType.Variable, name, ident)
    v.kind = kind
    this._variables.push(v)
    return v
  }

  setBlock(block: BlockStatement) {
    this.start = block.start
    this.end = block.end
  }
}

export class ScopeManager {
  private _counter: NumberCounter = new NumberCounter()
  private _global: Scope
  private _scopes: Scope[]

  context: Context

  constructor(context: Context) {
    this.context = context

    this._global = new Scope('global', true)
    this._global.start = context.ast.start
    this._global.end = context.ast.end
    this._scopes = [this._global]
  }

  private scopeExists(block: BlockStatement): boolean {
    return (
      this._scopes.findIndex(
        (s) => s.start === block.start && s.end === block.end
      ) !== -1
    )
  }

  private getIdentByAncestors(ancestors: Node[]): string {
    let ident = this._counter.next('id')

    return ident
  }

  createScope(block: BlockStatement, ancestors: Node[]): Scope {
    if (this.scopeExists(block)) return this.getScopeByBlock(block)

    // Find parent
    let slarr = [...ancestors].reverse().slice(1)
    let foundParentIndex = slarr.findIndex((i) => i.type === 'BlockStatement'),
      parentScope: Scope | undefined
    if (foundParentIndex !== -1) {
      let p = slarr[foundParentIndex] as BlockStatement

      if (p && !this.scopeExists(p)) {
        // Found parent is sliced off after
        parentScope = this.createScope(
          p,
          slarr.slice(foundParentIndex).reverse()
        )
      } else if (p && this.scopeExists(p)) {
        parentScope = this.getScopeByBlock(p)
      }
    } else {
      parentScope = this._global
    }

    let ident = this.getIdentByAncestors(ancestors)
    let scope = new Scope(ident, false)
    scope.setBlock(block)
    scope.parent = parentScope

    this._scopes.push(scope)
    return scope
  }

  getGlobal(): Scope {
    return this._global
  }

  getScopeByBlock(block: BlockStatement): Scope {
    let scope = this._scopes.find(
      (s) => s.start === block.start && s.end === block.end
    )
    //if (!scope) throw new Error('Scope does not exist for block')
    if (!scope) return this._global
    return scope
  }
}
