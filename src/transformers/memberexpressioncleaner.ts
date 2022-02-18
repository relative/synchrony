import { Program, Identifier, sp } from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import Context from '../context'

// only replace if the property accessor matches this
// will not match content-type
const VALID_DOT_REGEX = /^[a-z][\w]*$/i

export interface MemberExpressionCleanerOptions extends TransformerOptions {}
export default class MemberExpressionCleaner extends Transformer<MemberExpressionCleanerOptions> {
  constructor(options: Partial<MemberExpressionCleanerOptions>) {
    super('MemberExpressionCleaner', options)
  }

  clean(ast: Program) {
    walk(ast, {
      MemberExpression(node) {
        if (
          //!Guard.isIdentifier(node.object) ||
          Guard.isPrivateIdentifier(node.property) ||
          !Guard.isLiteralString(node.property)
        )
          return

        if (!node.property.value.match(VALID_DOT_REGEX)) return

        node.computed = false
        sp<Identifier>(node.property, {
          type: 'Identifier',
          name: node.property.value,
        })
      },
    })
    return this
  }

  public async transform(context: Context) {
    this.clean(context.ast)
  }
}
