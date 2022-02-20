// maybe acorn-walk would work if my types were better,
// but typescript is very confusing
// this code is extended upon from acorn-walk, see links and license below

//! MIT License
//!
//! Copyright (C) 2012-2020 by various contributors (see AUTHORS)
//!
//! Permission is hereby granted, free of charge, to any person obtaining a copy
//! of this software and associated documentation files (the "Software"), to deal
//! in the Software without restriction, including without limitation the rights
//! to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//! copies of the Software, and to permit persons to whom the Software is
//! furnished to do so, subject to the following conditions:
//!
//! The above copyright notice and this permission notice shall be included in
//! all copies or substantial portions of the Software.
//!
//! THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//! IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//! FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//! AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//! LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//! OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//! THE SOFTWARE.
//!
//! ^ https://github.com/acornjs/acorn/blob/49ac049201/AUTHORS
//! ^ https://github.com/acornjs/acorn/blob/49ac049201/acorn-walk/src/index.js

import { base as AcornBaseVisitors } from 'acorn-walk'
import * as ESTree from 'estree'
import { NodeType, NodeByType, Node } from './types'

type WalkerCallback<TState> = (node: ESTree.Node, state: TState) => void

type WalkerFn<T extends NodeType, TState> = (
  node: NodeByType<T>,
  state: TState | Node[],
  ancestors: Node[]
) => any
type Visitors<TState> = {
  [type in NodeType]?: WalkerFn<type, TState>
}

type RecursiveWalkerFn<T extends NodeType, TState> = (
  node: NodeByType<T>,
  state: TState | undefined,
  callback: WalkerCallback<TState>
) => void
type RecursiveVisitors<TState> = {
  [type in NodeType]?: RecursiveWalkerFn<type, TState>
}

export function walk<TState>(
  node: Node,
  visitors: Visitors<TState>,
  base?: RecursiveVisitors<TState>,
  state?: TState,
  _override?: NodeType
): Node {
  let ancestors: Node[] = []
  const baseVisitors = base || AcornBaseVisitors
  ;(function c(node, st, override) {
    let type: NodeType = override || node.type,
      found = visitors[type]
    let isNew = node !== ancestors[ancestors.length - 1]
    if (isNew) ancestors.push(node)
    baseVisitors[type]!(node as any, st, c as any) // this isn't undefined?
    if (found) {
      try {
        // new node
        found(node as any, st || ancestors, ancestors)
      } catch (err: any) {
        console.error(
          'Caught an error while attempting to run AST visitor!\n\nnode =',
          node,
          '\nerr =',
          err
        )
      }
    }
    if (isNew) ancestors.pop()
  })(node, state, _override)
  return node
}
