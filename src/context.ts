import * as t from '~/types'
import { NodePath, Visitor, visitors } from '@babel/traverse'
import { ParseResult } from '@babel/parser'
import { Hub } from '~/util/bhub'
import { ITransformer } from './util/transform'

type ExplodeKeys = keyof ReturnType<typeof visitors.explode>

enum LogLevel {
  Debug,
  Info,
  Warn,
  Error,
}

export class Context {
  ast: ParseResult<t.File>
  path: NodePath<t.Program>
  hub: Hub
  source: string

  // Transformer storage
  #storage: Record<string, any> = {}

  currentlyExecutingTransformer: ITransformer | null = null

  constructor(source: string, ast: ParseResult<t.File>) {
    this.ast = ast
    this.source = source

    this.hub = new Hub(this, this.source)
    this.path = NodePath.get({
      hub: this.hub,
      parentPath: null,
      parent: this.ast,
      container: this.ast,
      key: 'program',
    }).setContext()
    this.hub.scope = this.path.scope

    // this.transformers = this.buildTransformerList(transformers)
    // this.source = source
    // this.scopeManager = eslintScope.analyze(this.ast, {
    //   sourceType: isModule ? 'module' : 'script',
    // })
  }

  traverse<T>(_visitor: Visitor<T>, state: T): void
  traverse(_visitor: Visitor): void
  traverse(_visitor: any, state?: any) {
    const visitor = visitors.explode(_visitor as Visitor)

    // To catch errors inside traversal functions
    for (const key of Object.keys(visitor) as ExplodeKeys[]) {
      const obj = visitor[key]
      if (!obj) continue

      if (Array.isArray(obj.enter)) {
        /* eslint-disable */
        // @ts-expect-error
        obj.enter = obj.enter.map(fn => {
          let newFn = fn

          newFn = <S, P extends Node>(path: NodePath<P>, state: S): void => {
            try {
              return fn.apply(state, [path, state])
            } catch (err: any) {
              // throw err
              const c = typeof err === 'object' ? err.constructor : Error

              const obj = {
                stack: err.stack,
              }
              if (!obj.stack) Error.captureStackTrace(obj, newFn)
              // @ts-expect-error
              const newError = this.hub.buildError2(path.node, err.message, obj.stack, c)

              throw newError
            }
          }

          if (newFn !== fn) {
            newFn.toString = () => fn.toString()
          }

          return newFn
        })
        /* eslint-enable */
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.path.traverse(visitor, state)
  }

  public set<T = any>(name: string, value: T) {
    this.#storage[name] = value
  }
  public get<T = any>(name: string) {
    return this.#storage[name] as T
  }

  bind(transformer: ITransformer | null = null): Context {
    this.currentlyExecutingTransformer = transformer
    return this
  }

  addComment(p: t.Node | NodePath<t.Node>, content: string) {
    // TODO: disable node comments
    if (this.currentlyExecutingTransformer?.name) {
      content = ` [${this.currentlyExecutingTransformer.name}]: ${content} `
    } else {
      content = ` ${content} `
    }
    if (t.isNode(p)) {
      t.addComment(p, 'leading', content)
    } else {
      p.addComment('leading', content)
    }
  }

  /* eslint-disable @typescript-eslint/no-unsafe-argument */
  private log_(level: LogLevel, message?: any, ...optionalParams: any[]) {
    // if (!this.enableLog) return
    const prefix = this.currentlyExecutingTransformer?.name ? `[${this.currentlyExecutingTransformer.name}]` : ''
    switch (level) {
      case LogLevel.Debug:
        console.log(prefix, 'debug:', message, ...optionalParams)
        break
      case LogLevel.Info:
        console.info(prefix, 'info:', message, ...optionalParams)
        break
      case LogLevel.Warn:
        console.warn(prefix, 'warn:', message, ...optionalParams)
        break
      case LogLevel.Error:
        console.error(prefix, 'error:', message, ...optionalParams)
        break
    }
  }
  /* eslint-enable */
  public log = {
    debug: this.log_.bind(this, LogLevel.Debug),
    info: this.log_.bind(this, LogLevel.Info),
    warn: this.log_.bind(this, LogLevel.Warn),
    error: this.log_.bind(this, LogLevel.Error),
  }
}

export function getContext(p: Context | NodePath): Context {
  return (p.hub as Hub).ctx
}
