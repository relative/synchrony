import { Program, BlockStatement, sp } from '../util/types'
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

      for (let stmt of node.body) {
        if (
          Guard.isExpressionStatement(stmt) &&
          Guard.isSequenceExpression(stmt.expression)
        ) {
          let i = node.body.findIndex(
            (s) => s.start === stmt.start && s.end === stmt.end
          )
          let expr = stmt.expression.expressions.map((exp) => ({
            type: 'ExpressionStatement',
            expression: exp,
          }))
          ;(node.body[i] as any) = expr
        }
      }
      sp<Program>(node, { body: node.body.flat() })
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
