import escodegen from 'escodegen'
import * as acorn from 'acorn' // no, it cannot be a default import
import path from 'path'
import fs from 'fs'
import Transformer from './transformers/transformer'
import { Program } from './util/types'
import Context from './context'
const FILE_REGEX = /(?<!\.d)\.[mc]?[jt]s$/i // cjs, mjs, js, ts, but no .d.ts

// TODO: remove this when https://github.com/acornjs/acorn/commit/a4a5510 lands
type ecmaVersion =
  | 3
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 2015
  | 2016
  | 2017
  | 2018
  | 2019
  | 2020
  | 2021
  | 2022
  | 'latest'

export interface DeobfuscateOptions {
  ecmaVersion: ecmaVersion

  /**
   * Custom transformers to use
   */
  customTransformers: Transformer<any>[]
}

export class Deobfuscator {
  public defaultOptions: DeobfuscateOptions = {
    ecmaVersion: 'latest',
    customTransformers: [],
  }
  private _transformers: typeof Transformer[] = []

  constructor() {}

  public async loadTransformers() {
    const dir = path.join(__dirname, 'transformers')
    let files = fs
      .readdirSync(dir)
      .filter(
        (name) => name.match(FILE_REGEX) && !name.startsWith('transformer')
      )

    let transformers = (
      await Promise.all(files.map((name) => import(path.join(dir, name))))
    ).map((t) => t.default)

    this._transformers = transformers
  }

  private buildOptions(
    options: Partial<DeobfuscateOptions> = {}
  ): DeobfuscateOptions {
    return { ...this.defaultOptions, ...options }
  }

  private buildTransformerList(list: [string, object][]): Transformer<any>[] {
    let transformers: Transformer<any>[] = []
    for (let [name, opt] of list) {
      let found = this._transformers.find((t: any) => t.name === name)
      if (!found) {
        console.error(
          'Invalid transformer in config',
          name,
          'it does not exist'
        )
        continue
      }
      transformers.push(new (found as any)(opt))
    }
    return transformers
  }

  public async deobfuscateNode(
    node: Program,
    _options?: Partial<DeobfuscateOptions>
  ): Promise<Program> {
    const options = this.buildOptions(_options)
    const context = new Context(node)
    // perform transforms
    /*let transformers = this._transformers.map(
      (t: any) => new t({})
    ) as Transformer<any>[]*/
    let transformers = this.buildTransformerList([
      ['Simplify', {}],
      ['MemberExpressionCleaner', {}],
      ['LiteralMap', {}],

      ['StringDecoder', {}],

      ['Simplify', {}],
      ['MemberExpressionCleaner', {}],

      ['ControlFlow', {}],

      ['Desequence', {}],
    ])
    for (const t of transformers) {
      console.log('Running', t.name, 'transformer')
      await t.transform(context)
    }
    return context.ast
  }

  public async deobfuscateSource(
    source: string,
    _options?: Partial<DeobfuscateOptions>
  ): Promise<string> {
    const options = this.buildOptions(_options)
    let ast = acorn.parse(source, {
      ecmaVersion: options.ecmaVersion,
    }) as Program

    // perform transforms
    ast = await this.deobfuscateNode(ast, options)

    source = escodegen.generate(ast)
    return source
  }
}
