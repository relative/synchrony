import Context from '../context'

export interface TransformerOptions {
  log: boolean
}
export abstract class Transformer<TOptions extends TransformerOptions> {
  name: string
  options: TOptions

  constructor(name: string, options: Partial<TOptions>) {
    this.name = name
    this.options = this.buildOptions(options)
  }

  protected buildOptions(options: Partial<TOptions>): TOptions {
    return { log: true, ...(options as any) }
  }
  public abstract transform(context: Context): Promise<void>
}
