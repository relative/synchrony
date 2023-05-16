import { Context } from './context'
import { ParseResult, parse } from '@babel/parser'
import * as t from '~/types'
import { TransformerArray, addTransformer, getTransformerByName } from './util/transform'
import generate from '@babel/generator'
import { fromZodError } from 'zod-validation-error'

export interface DeobfuscateOptions {
  /**
   * Custom transformers to use
   *
   * You must use the `addTransformer` function to achieve proper type safety when adding elements to the TransformerArray
   */
  customTransformers: TransformerArray

  /**
   * Rename identifiers (default = false)
   */
  rename: boolean

  /**
   * Source type (default = unambiguous)
   *
   * Maps to babel/parser option "sourceType"
   * @see https://babeljs.io/docs/babel-parser#options
   */
  sourceType: 'unambiguous' | 'module' | 'script'

  /**
   * Loose parsing (default = false)
   *
   * Maps to babel/parser option "errorRecovery"
   * @see https://babeljs.io/docs/babel-parser#options
   */
  loose: boolean
}

// function sourceHash(str: string) {
//   let key = 0x94a3fa21
//   let length = str.length
//   while (length) key = (key * 33) ^ str.charCodeAt(--length)
//   return key >>> 0
// }

export class Deobfuscator {
  public defaultOptions: DeobfuscateOptions = {
    customTransformers: [],
    rename: false,
    sourceType: 'unambiguous',
    loose: false,
  }

  private buildOptions(options: Partial<DeobfuscateOptions> = {}): DeobfuscateOptions {
    return { ...this.defaultOptions, ...options }
  }

  private parse(source: string, options: DeobfuscateOptions) {
    return parse(source, {
      attachComment: true,
      ranges: true,
      errorRecovery: options.loose,
      sourceType: options.sourceType,
    })
  }

  private async deobfuscate(source: string, node: ParseResult<t.File>, _options: DeobfuscateOptions): Promise<Context> {
    const ctx = new Context(source, node)

    // const transformers: TransformerArray = [
    //   addTransformer('generic/simplify', {}),
    //   addTransformer('generic/foldconstants', {}),
    //   addTransformer('javascript-obfuscator/demap', {}),
    //   addTransformer('generic/desequence', {}),
    //   addTransformer('generic/dememberize', {}),
    //   addTransformer('generic/deproxify', {}),

    //   addTransformer('generic/foldconstants', {}),
    //   addTransformer('generic/simplify', {}),

    //   addTransformer('javascript-obfuscator/stringdecoder', {}),
    //   addTransformer('generic/dememberize', {}),
    //   addTransformer('javascript-obfuscator/demap', {}),
    //   addTransformer('javascript-obfuscator/unflattencontrolflow', {}),

    //   addTransformer('generic/foldconstants', {}),
    //   addTransformer('generic/deadcode', {}),
    //   addTransformer('generic/simplify', {}),
    //   addTransformer('finalizer/beautify', {}),
    // ]
    const transformers: TransformerArray = [
      addTransformer('generic/simplify', {}),
      addTransformer('generic/foldconstants', {}),
      // addTransformer('javascript-obfuscator/demap', {}),
      addTransformer('generic/desequence', {}),
      addTransformer('generic/dememberize', {}),
      addTransformer('generic/deproxify', {}),
      addTransformer('generic/staticvar', {}),

      addTransformer('generic/foldconstants', {}),
      addTransformer('generic/simplify', {}),

      addTransformer('jsconfuser/fixer', {}),
      addTransformer('jsconfuser/constants', {}),
      addTransformer('jsconfuser/unstack', {}),
      addTransformer('generic/deproxify', {}),
      addTransformer('jsconfuser/unmangle', {}),

      addTransformer('jsconfuser/stringdecoder', {}),
      addTransformer('generic/dememberize', {}),
      addTransformer('generic/staticvar', {
        propInclude: [],
      }),

      addTransformer('generic/foldconstants', {}),
      addTransformer('generic/dememberize', {}),
      addTransformer('generic/deadcode', {}),
      addTransformer('generic/simplify', {}),
      addTransformer('finalizer/beautify', {}),
    ]

    for (const transformer of transformers) {
      const [tName, tOpts] = transformer
      const t = getTransformerByName(tName)
      const result = await t.schema.safeParseAsync(tOpts)
      if (result.success) {
        transformer[1] = result.data
      } else {
        const validationError = fromZodError(result.error, {
          prefix: `transformers[${tName}]`,
        })
        throw validationError
      }
    }

    for (const [tName, tOpts] of transformers) {
      ctx.bind()
      const t = getTransformerByName(tName)
      ctx.log.info('Running', tName)
      await t.run(ctx.bind(t), tOpts)
    }

    return ctx
  }

  public async deobfuscateNode(node: t.Program, _options?: Partial<DeobfuscateOptions>): Promise<t.Program> {
    const options = this.buildOptions(_options)
    // Need to generate code for node because Context requires source code
    const gen = generate(node, { comments: true, minified: false })
    // Reparse to get babel ParseResult
    const result = this.parse(gen.code, options)
    const ctx = await this.deobfuscate(gen.code, result, options)

    return ctx.ast.program
  }

  public async deobfuscateSource(source: string, _options?: Partial<DeobfuscateOptions>): Promise<string> {
    const options = this.buildOptions(_options)
    const result = this.parse(source, options)

    const ctx = await this.deobfuscate(source, result, options)
    const gen = generate(ctx.ast, {
      comments: true,
      minified: false,
    })
    return gen.code
  }
}
