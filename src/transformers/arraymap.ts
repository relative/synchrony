import {
  sp,
  Property,
  Literal,
  Function,
  ArrowFunctionExpression,
  FunctionExpression,
  FunctionDeclaration,
  Identifier,
  VariableDeclarator,
  VariableDeclaration,
} from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk, findNodeAt } from '../util/walk'
import * as Guard from '../util/guard'
import Context from '../context'
import { filterEmptyStatements } from '../util/helpers'

export interface ArrayMapOptions extends TransformerOptions {}
export default class ArrayMap extends Transformer<ArrayMapOptions> {
  constructor(options: Partial<ArrayMapOptions>) {
    super('ArrayMap', options)
  }

  // demaps arrays that have literals and that start with [null]
  demap(context: Context) {
    function visitor(func: Function) {
      if (!Guard.isBlockStatement(func.body)) return
      const body = filterEmptyStatements(func.body.body)
      if (!body[0]) return
      if (!Guard.isVariableDeclaration(body[0])) return
      const vd = body[0]
      if (vd.declarations.length !== 1) return
      const decl = vd.declarations[0]
      if (!decl.init || !Guard.isArrayExpression(decl.init)) return
      if (decl.init.elements[0] !== null) return
      if (!Guard.isIdentifier(decl.id)) return
      const name = decl.id.name
      let values: (string | number)[] = decl.init.elements.map((el) =>
        el && Guard.isLiteral(el) ? el.value : el
      ) as (string | number)[]

      walk(func, {
        MemberExpression(mx) {
          if (!Guard.isIdentifier(mx.object)) return
          if (!Guard.isLiteralNumeric(mx.property)) return
          if (mx.object.name !== name) return
          let index = mx.property.value
          if (index >= values.length) return
          let val = values[mx.property.value]
          sp<Literal>(mx, { type: 'Literal', value: val })
        },
      })
      func.body.body = func.body.body.filter(
        (i) => i.start !== vd.start && i.end !== vd.end
      )
    }
    walk(context.ast, {
      FunctionDeclaration: visitor,
      FunctionExpression: visitor,
      ArrowFunctionExpression: visitor,
    })

    return this
  }

  public async transform(context: Context) {
    this.demap(context)
  }
}
