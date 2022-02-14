import { Program, BlockStatement, sp } from '../util/types'
import Transformer from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import Context from '../context'

export interface DesqeuenceOptions {}
export default class Desequence extends Transformer<DesqeuenceOptions> {
  constructor(options: DesqeuenceOptions) {
    super('Desequence', options)
  }

  desequence(ast: Program) {
    walk(ast, {
      BlockStatement(node) {
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
        sp<BlockStatement>(node, { body: node.body.flat() })
      },
    })
    return this
  }

  public async transform(context: Context) {
    this.desequence(context.ast)
  }
}
