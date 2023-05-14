// MIT License

// Copyright (c) 2014-present Sebastian McKenzie and other contributors

// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:

// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// https://github.com/babel/babel/blob/main/LICENSE
// https://github.com/babel/babel/blob/e5e13691507de308aefcddfd754c20a4cd90492a/packages/babel-core/src/transformation/file/file.ts

import { codeFrameColumns } from '@babel/code-frame'
import traverse, { HubInterface, Scope, Visitor } from '@babel/traverse'
import * as t from '~/types'
import { colorEnabled } from './forceColor'

const errorVisitor: Visitor<{ loc: t.Node['loc'] | null }> = {
  enter(path, state) {
    const loc = path.node.loc
    if (loc) {
      state.loc = loc
      path.stop()
    }
  },
}

export class Hub implements HubInterface {
  public code = ''
  public scope?: Scope
  constructor(code: string) {
    this.code = code
  }
  getCode(): string | undefined {
    return this.code
  }
  getScope(): Scope | undefined {
    return this.scope
  }
  addHelper(_name: string): void {
    return
  }

  private buildCodeFrame(node: t.Node): string {
    let codeFrame = ''

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    let loc = <t.SourceLocation | null | undefined>(node && (node.loc || (node as any)._loc))
    if (!loc && node) {
      const state: { loc: t.Node['loc'] | null } = {
        loc: null,
      }
      traverse(node, errorVisitor, this.scope, state)
      loc = state.loc

      let txt = 'This is an error on an internal node. Probably an internal error.'
      if (loc) txt += ' Location has been estimated.'
      codeFrame += ` (${txt})`
    }
    if (loc) {
      codeFrame +=
        '\n' +
        codeFrameColumns(
          this.code,
          {
            start: {
              line: loc.start.line,
              column: loc.start.column + 1,
            },
            end:
              loc.end && loc.start.line === loc.end.line
                ? { line: loc.end.line, column: loc.end.column + 1 }
                : undefined,
          },
          {
            highlightCode: colorEnabled(),
            forceColor: colorEnabled(),
          }
        )
    }

    return codeFrame
  }

  buildError<E extends Error>(node: t.Node, msg: string, Error: new (message?: string | undefined) => E): E {
    return new Error(msg + this.buildCodeFrame(node))
  }
  buildError2<E extends Error>(
    node: t.Node,
    msg: string,
    stack: string,
    Error: new (message?: string | undefined) => E
  ): E {
    const codeFrame = this.buildCodeFrame(node)
    const e = new Error(msg + codeFrame)
    e.stack = codeFrame + '\n' + stack
    return e
  }
}
