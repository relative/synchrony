import { NodePath } from '@babel/traverse'
import { ok } from 'assert'
import * as t from '~/types'

/* eslint-disable */
export function evaluateBinaryExpression(
  lhs: string | number,
  operator: t.BinaryExpression['operator'],
  rhs: string | number
) {
  switch (operator) {
    case '!=':
      return lhs != rhs
    case '!==':
      return lhs !== rhs
    case '%':
      ok(typeof lhs === 'number' || typeof lhs === 'bigint', 'left hand side is not numeric')
      ok(typeof rhs === 'number' || typeof rhs === 'bigint', 'right hand side is not numeric')
      return lhs % rhs
    case '&':
      ok(typeof lhs === 'number' || typeof lhs === 'bigint', 'left hand side is not numeric')
      ok(typeof rhs === 'number' || typeof rhs === 'bigint', 'right hand side is not numeric')
      return lhs & rhs
    case '*':
      ok(typeof lhs === 'number' || typeof lhs === 'bigint', 'left hand side is not numeric')
      ok(typeof rhs === 'number' || typeof rhs === 'bigint', 'right hand side is not numeric')
      return lhs * rhs
    case '**':
      ok(typeof lhs === 'number' || typeof lhs === 'bigint', 'left hand side is not numeric')
      ok(typeof rhs === 'number' || typeof rhs === 'bigint', 'right hand side is not numeric')
      return lhs ** rhs
    case '+':
      // @ts-expect-error
      return lhs + rhs
    case '-':
      // @ts-expect-error
      return lhs - rhs
    case '/':
      // @ts-expect-error
      return lhs / rhs
    case '<':
      return lhs < rhs
    case '<<':
      // @ts-expect-error
      return lhs << rhs
    case '<=':
      return lhs <= rhs
    case '==':
      return lhs == rhs
    case '===':
      return lhs === rhs
    case '>':
      return lhs > rhs
    case '>=':
      return lhs >= rhs
    case '>>':
      // @ts-expect-error
      return lhs >> rhs
    case '>>>':
      // @ts-expect-error
      return lhs >>> rhs
    case '^':
      // @ts-expect-error
      return lhs ^ rhs
    case '|':
      // @ts-expect-error
      return lhs | rhs
  }
  throw new TypeError(`Can't evalute binary expression "${lhs} ${operator} ${rhs}"`)
}
/* eslint-enable */

// https://github.com/babel/babel/blob/v7.21.8/packages/babel-traverse/src/path/evaluation.ts#L41
// Original method has invalid type, should probably open an issue lol
export function evaluateTruthy(p: NodePath): boolean | undefined {
  const res = p.evaluate()
  if (res.confident) return !!res.value
}

export function allEqual(p: any[]): boolean {
  if (p.length <= 1) return true
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const el = p[0]
  return !p.some(v => v !== el)
}

export function willPathMaybeExecuteBeforeAllNodes(path: NodePath, nodes: NodePath[]): boolean {
  for (const node of nodes) {
    if (node.isAssignmentExpression()) {
      const f = path.findParent(p => p.parentPath === node)
      if (f && f.key !== 'right') return false
    } else {
      if (path.isDescendant(node)) return false
    }
    if (!path.willIMaybeExecuteBefore(node)) return false
  }
  return true
}
