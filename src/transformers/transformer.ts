import { Program } from '../util/types'
import Context from '../context'

export default class Transformer<T> {
  name: string
  options: T

  constructor(name: string, options: T) {
    this.name = name
    this.options = options
  }

  public async transform(context: Context) {}
}
