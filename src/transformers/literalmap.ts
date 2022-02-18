import { sp, Property, Literal } from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import Context from '../context'

export interface LiteralMapOptions extends TransformerOptions {}
export default class LiteralMap extends Transformer<LiteralMapOptions> {
  constructor(options: Partial<LiteralMapOptions>) {
    super('LiteralMap', options)
  }

  demap(context: Context) {
    walk(context.ast, {
      BlockStatement(node) {
        const map: { [x: string]: { [x: string]: any } } = {}

        walk(node, {
          VariableDeclaration(vd) {
            let rm: string[] = []
            if (vd.declarations.length === 0) return
            for (const decl of vd.declarations) {
              if (
                !decl.init ||
                decl.init.type !== 'ObjectExpression' ||
                !Guard.isIdentifier(decl.id)
              )
                continue
              if (
                !decl.init.properties.every(
                  (p) =>
                    p.type !== 'SpreadElement' &&
                    (Guard.isLiteral(p.key) || Guard.isIdentifier(p.key)) &&
                    Guard.isLiteral(p.value)
                )
              )
                continue

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

              if (context.removeGarbage) {
                rm.push(`${decl.start}!${decl.end}`)
              }
            }
            vd.declarations = vd.declarations.filter(
              (d) => !rm.includes(`${d.start}!${d.end}`)
            )
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
            if (typeof val === 'undefined') return // ! check causes !0 == true.
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
    this.demap(context)
  }
}
