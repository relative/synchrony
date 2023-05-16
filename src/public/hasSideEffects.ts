import { NodePath } from '@babel/traverse'
import * as t from '~/types'

// todo:
export function hasSideEffects(path: NodePath<t.Node | null | undefined>) {
  if (!path.node) return true
  if (path.isLiteral() || path.isIdentifier()) return false
  return true
}
