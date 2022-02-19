import Context from '../context'

export interface TransformerOptions {}
export abstract class Transformer<TOptions extends TransformerOptions> {
  name: string
  options: TOptions

  constructor(name: string, options: Partial<TOptions>) {
    this.name = name
    this.options = this.buildOptions(options)
  }

  protected buildOptions(options: Partial<TOptions>): TOptions {
    return { ...(options as any) }
  }
  public abstract transform(context: Context): Promise<void>
}
