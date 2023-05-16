import { NodePath } from '@babel/traverse'
import { Context } from '~/context'
import * as t from '~/types'
import { createLiteral } from '~/util/translator'

export function foldConstants(p: Context | NodePath) {
  p.traverse({
    UnaryExpression(p) {
      const evaluated = p.evaluate()
      if (evaluated.confident) {
        const node = createLiteral(evaluated.value)
        if (node) {
          p.replaceWith(node)
          p.scope.crawl()
        }
      }
    },
    BinaryExpression(p) {
      const evaluated = p.evaluate()
      if (evaluated.confident) {
        const node = createLiteral(evaluated.value)
        if (node) {
          p.replaceWith(node)
          p.scope.crawl()
        }
      }
    },
  })
}
