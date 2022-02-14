import { Program, BlockStatement, sp, Property, Literal } from '../util/types'
import Transformer from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import Context from '../context'

export interface LiteralMapOptions {}
export default class LiteralMap extends Transformer<LiteralMapOptions> {
  constructor(options: LiteralMapOptions) {
    super('LiteralMap', options)
  }

  demap(ast: Program) {
    walk(ast, {
      BlockStatement(node) {
        const map: { [x: string]: { [x: string]: any } } = {}

        walk(node, {
          VariableDeclarator(decl) {
            if (
              !decl.init ||
              decl.init.type !== 'ObjectExpression' ||
              !Guard.isIdentifier(decl.id)
            )
              return
            if (
              !decl.init.properties.every(
                (p) =>
                  p.type !== 'SpreadElement' &&
                  (Guard.isLiteral(p.key) || Guard.isIdentifier(p.key)) &&
                  Guard.isLiteral(p.value)
              )
            )
              return

            const name = decl.id.name
            map[name] = map[name] || {}

            for (const _prop of decl.init.properties) {
              const prop = _prop as Property
              let key =
                prop.key.type === 'Identifier'
                  ? prop.key.name
                  : ((prop.key as Literal).value as string)
              map[name][key] = (prop.value as Literal).value as string
            }
          },
        })

        walk(node, {
          MemberExpression(exp) {
            if (
              !Guard.isIdentifier(exp.object) ||
              (!Guard.isLiteral(exp.property) &&
                !Guard.isIdentifier(exp.property))
            )
              return
            let mapObj = map[exp.object.name]
            if (!mapObj) return

            let key = Guard.isIdentifier(exp.property)
              ? exp.property.name
              : ((exp.property as Literal).value as string)
            let val = mapObj[key]
            if (!val) return
            sp<Literal>(exp, {
              type: 'Literal',
              value: val,
            })
          },
        })
      },
    })

    return this
  }

  public async transform(context: Context) {
    this.demap(context.ast)
  }
}
