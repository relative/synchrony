import type { Context } from '~/context'
import { MaybePromise } from '~/types'
import { z } from 'zod'

declare global {
  namespace Synchrony {
    interface Transformers {
      [key: Lowercase<string>]: object
    }
  }
}
export type TransformerVal<TKey extends Lowercase<string>> = Synchrony.Transformers[Lowercase<TKey>]
export type TransformerTuple<Name extends Lowercase<string> = keyof Synchrony.Transformers> = [
  Name,
  TransformerVal<Name>
]
export type TransformerArray = TransformerTuple[]

export type TransformerCallback<OptionType = unknown> = (ctx: Context, opts: OptionType) => MaybePromise<any>

export interface ITransformer<TSchema extends z.AnyZodObject = z.AnyZodObject> {
  /**
   * Always lowercase
   */
  name: string

  schema: TSchema

  run: TransformerCallback<z.infer<TSchema>>
}

export type CreateTransformerOptions<TSchema extends z.AnyZodObject = z.AnyZodObject> = Pick<
  ITransformer<TSchema>,
  'schema' | 'run'
>

const transformerRegistry: ITransformer[] = []

/**
 * Create and register transformer
 * @param name Transformer name (will be turned into lowercase)
 * @param opts
 * @returns
 */
export function createTransformer<TSchema extends z.AnyZodObject = z.AnyZodObject>(
  name: string,
  opts: Partial<CreateTransformerOptions<TSchema>>
): ITransformer {
  const nameLower = name.toLowerCase()
  if (transformerRegistry.find(t => t.name === nameLower))
    throw new Error(`Transformer with name "${name}" already exists`)

  const realOpts: CreateTransformerOptions = {
    schema: z.object({}),

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    run: () => {},

    ...opts,
  }

  const t: ITransformer = { name: nameLower, ...realOpts }
  transformerRegistry.push(t)
  return t
}

export function getTransformerByName(name: string): ITransformer {
  const nameLower = name.toLowerCase()
  const t = transformerRegistry.find(t => t.name === nameLower)
  if (!t) throw new Error(`Cannot find transformer with name "${name}"`)
  return t
}

export function addTransformer<
  TName extends string,
  TOpt extends TransformerVal<Lowercase<TName>> = TransformerVal<Lowercase<TName>>
>(name: TName, opts: TOpt): TransformerTuple<Lowercase<TName>> {
  return [name.toLowerCase() as Lowercase<TName>, opts]
}
