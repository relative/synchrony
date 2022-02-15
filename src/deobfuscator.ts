import escodegen from 'escodegen'
import * as acorn from 'acorn' // no, it cannot be a default import
import { Transformer } from './transformers/transformer'
import { Program } from './util/types'
import Context from './context'
import prettier from 'prettier'
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
  /**
   * ECMA version to use when parsing AST (see acorn, default = 'latest')
   */
  ecmaVersion: ecmaVersion

  /**
   * Custom transformers to use
   */
  customTransformers: typeof Transformer[]
}

export class Deobfuscator {
  public defaultOptions: DeobfuscateOptions = {
    ecmaVersion: 'latest',
    customTransformers: [],
  }

  private buildOptions(
    options: Partial<DeobfuscateOptions> = {}
  ): DeobfuscateOptions {
    return { ...this.defaultOptions, ...options }
  }

  public async deobfuscateNode(
    node: Program,
    _options?: Partial<DeobfuscateOptions>
  ): Promise<Program> {
    const options = this.buildOptions(_options)
    const context = new Context(node, [
      ['Simplify', {}],
      ['MemberExpressionCleaner', {}],
      ['LiteralMap', {}],

      ['StringDecoder', {}],

      ['Simplify', {}],
      ['MemberExpressionCleaner', {}],

      ['ControlFlow', {}],

      ['Desequence', {}],
    ])

    for (const t of context.transformers) {
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
    let acornOptions: acorn.Options = {
      ecmaVersion: options.ecmaVersion,
    }
    let ast = acorn.parse(source, acornOptions) as Program

    // perform transforms
    ast = await this.deobfuscateNode(ast, options)

    source = escodegen.generate(ast)
    source = prettier.format(source, {
      semi: false,
      singleQuote: true,
      parser(text, _opts) {
        return acorn.parse(text, acornOptions)
      },
    })
    return source
  }
}
