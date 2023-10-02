import { Program, BlockStatement, sp, ExpressionStatement } from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import Context from '../context'

export interface DesqeuenceOptions extends TransformerOptions {}
export default class Desequence extends Transformer<DesqeuenceOptions> {
  constructor(options: Partial<DesqeuenceOptions>) {
    super('Desequence', options)
  }

  desequence(ast: Program) {
    function visitor(node: BlockStatement | Program) {
      // find expstmt > seqexp in node.body

      let length = node.body.length
      for (let i = 0; i < length; ++i) {
        const stmt = node.body[i]
        if (
          Guard.isExpressionStatement(stmt) &&
          Guard.isSequenceExpression(stmt.expression)
        ) {
          node.body[i].type = 'EmptyStatement'
          let expr = stmt.expression.expressions.map((exp) => ({
            type: 'ExpressionStatement',
            expression: exp,
          })) as ExpressionStatement[]
          node.body.splice(i, 0, ...expr)
          i += expr.length
          length = node.body.length
        }
      }
    }
    walk(ast, {
      BlockStatement(node) {
        visitor(node)
      },
      Program(node) {
        visitor(node)
      },
    })
    return this
  }

  public async transform(context: Context) {
    this.desequence(context.ast)
  }
}
