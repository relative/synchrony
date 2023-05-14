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
