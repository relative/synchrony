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

export interface LiteralMapOptions extends TransformerOptions {}
export default class LiteralMap extends Transformer<LiteralMapOptions> {
  constructor(options: Partial<LiteralMapOptions>) {
    super('LiteralMap', options)
  }

  demap(context: Context) {
    walk(context.ast, {
      BlockStatement(node) {
        const map = new Map<string, Map<string, any>>()

        walk(node, {
          VariableDeclaration(vd) {
            let rm: string[] = []
            for (const decl of vd.declarations) {
              if (
                !decl.init ||
                decl.init.type !== 'ObjectExpression' ||
                !Guard.isIdentifier(decl.id)
              )
                continue
              if (decl.init.properties.length === 0) continue
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
              const localMap = map.get(name) || new Map<string, any>()
              for (const _prop of decl.init.properties) {
                const prop = _prop as Property
                let key =
                  prop.key.type === 'Identifier'
                    ? prop.key.name
                    : ((prop.key as Literal).value as string)
                localMap.set(key, (prop.value as Literal).value as string)
              }
              if (!map.has(name)) map.set(name, localMap)

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
            let mapObj = map.get(exp.object.name)
            if (!mapObj) return

            let key = Guard.isIdentifier(exp.property)
              ? exp.property.name
              : ((exp.property as Literal).value as string)
            let val = mapObj.get(key)
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

  // replace read-only variables in functions
  literals(context: Context) {
    function visitor(func: Function) {
      const scope = context.scopeManager.acquire(func)
      if (!scope) return

      for (const v of scope.variables) {
        if (v.name === 'arguments') continue
        if (v.identifiers.length !== 1) continue // ?
        if (v.defs.length !== 1) continue // ?

        const def = v.defs[0]
        if (def.type !== 'Variable') continue // ?
        const vd = def.node as VariableDeclarator

        if (vd.init?.type !== 'Literal') continue
        if (typeof vd.init.value === 'string' && vd.init.value.length === 65)
          continue

        // prevents us from replacing overwrote variables
        if (!v.references.every((ref) => ref.init || ref.isReadOnly())) continue

        for (const ref of v.references) {
          // Dont replace our init reference lol
          if (ref.init) {
            let node = def.node as VariableDeclarator
            let p = def.parent as VariableDeclaration
            if (p.type === 'VariableDeclaration') {
              p.declarations = p.declarations.filter(
                (decl) => decl.start !== node.start && decl.end !== node.end
              )
            }
            continue
          }
          const refid = findNodeAt<Identifier>(
            func,
            ref.identifier.range!,
            'Identifier'
          )
          if (!refid) continue // hm
          sp<Literal>(refid, vd.init)
        }
      }
    }
    walk(context.ast, {
      FunctionDeclaration: visitor,
      FunctionExpression: visitor,
      ArrowFunctionExpression: visitor,
    })
    return this
  }

  public async transform(context: Context) {
    this.demap(context).literals(context)
  }
}
