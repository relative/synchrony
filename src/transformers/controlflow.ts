import {
  Node,
  Literal,
  Property,
  sp,
  getBlockId,
  PropertyLiteral,
  CallExpression,
  FunctionExpression,
  Identifier,
} from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import Context from '../context'
import { immutate, filterEmptyStatements } from '../util/helpers'

export interface ControlFlowOptions extends TransformerOptions {}
export default class ControlFlow extends Transformer<ControlFlowOptions> {
  constructor(options: Partial<ControlFlowOptions>) {
    super('ControlFlow', options)
  }

  // maybe global util function
  private translateCallExp(fx: FunctionExpression, cx: CallExpression) {
    if (!Guard.isReturnStatement(fx.body.body[0]))
      throw new TypeError(
        'Function in CFSN was invalid (not a returnstatement)'
      )
    if (!fx.params.every((p) => Guard.isIdentifier(p)))
      throw new TypeError('Function in CFSN was invalid (not ident params)')
    if (!fx.body.body[0].argument)
      throw new TypeError('Function in CFSN was invalid (void return)')

    let params = fx.params as Identifier[],
      paramMap: { [ident: string]: Node } = {}
    let i = 0
    for (const p of params) {
      paramMap[p.name] = cx.arguments[i]
      ++i
    }
    let immRtn = immutate(fx.body.body[0].argument)
    walk(immRtn, {
      Identifier(id) {
        if (!paramMap[id.name]) return
        sp<Node>(id, paramMap[id.name])
      },
    })

    return immRtn as Node
  }

  // separate finding literals/functions from each other?
  // current way makes code a bit confusing to follow ^^
  findStorageNode(context: Context) {
    walk(context.ast, {
      BlockStatement(node) {
        // /shrug
        let bid = getBlockId(node)

        if (context.controlFlowStorageNodes[bid]) return
        if (node.body.length === 0) return

        walk(node, {
          VariableDeclaration(vd) {
            let rm: string[] = []
            for (const decl of vd.declarations) {
              if (!Guard.isIdentifier(decl.id)) continue
              if (decl.init?.type !== 'ObjectExpression') continue
              if (decl.init.properties.length === 0) continue
              if (
                !decl.init.properties.every(
                  (p) =>
                    p.type !== 'SpreadElement' &&
                    ['FunctionExpression', 'Literal'].includes(p.value.type) &&
                    (p.key.type === 'Literal' || p.key.type === 'Identifier')
                )
              )
                continue
              context.controlFlowStorageNodes[bid] = {
                identifier: decl.id.name,
                functions: [],
                literals: [],
              }
              const cfsn = context.controlFlowStorageNodes[bid]
              for (const prop of decl.init.properties as PropertyLiteral[]) {
                let kn: Identifier | Literal = prop.key
                let key = (
                    Guard.isIdentifier(kn) ? kn.name : kn.value
                  )! as string,
                  i = -1
                if (Guard.isLiteral(prop.value)) {
                  if (
                    (i = cfsn.literals.findIndex(
                      (l) => l.identifier === key
                    )) !== -1
                  ) {
                    // exists
                    cfsn.literals[i].value = prop.value.value as string
                  } else {
                    cfsn.literals.push({
                      identifier: key,
                      value: prop.value.value as string,
                    })
                  }
                } else if (Guard.isFunctionExpression(prop.value)) {
                  let fnb = filterEmptyStatements(prop.value.body.body)
                  if (fnb.length !== 1) continue
                  if (!Guard.isReturnStatement(fnb[0])) continue
                  let imm = immutate(prop.value)
                  imm.body.body = fnb
                  if (
                    (i = cfsn.functions.findIndex(
                      (f) => f.identifier === key
                    )) !== -1
                  ) {
                    // exists
                    cfsn.functions[i].node = imm
                  } else {
                    cfsn.functions.push({
                      identifier: key,
                      node: imm,
                    })
                  }
                }
              }
              context.log(
                'Found control flow node id =',
                decl.id.name,
                '#fn =',
                cfsn.functions.length,
                '#lit =',
                cfsn.literals.length
              )
              if (context.removeGarbage) {
                rm.push(`${decl.start}!${decl.end}`)
              }
            }
            vd.declarations = vd.declarations.filter(
              (d) => !rm.includes(`${d.start}!${d.end}`)
            )
            if (vd.declarations.length === 0) {
              // this node wont generate if it has no declarations left
              ;(vd as any).type = 'EmptyStatement'
            }
          },
        })
      },
    })
    return this
  }

  replacer(context: Context) {
    const { translateCallExp } = this
    walk(context.ast, {
      BlockStatement(node) {
        const bid = getBlockId(node)
        if (!context.controlFlowStorageNodes[bid]) return
        const cfsn = context.controlFlowStorageNodes[bid]

        walk(node, {
          MemberExpression(mx) {
            if (!Guard.isIdentifier(mx.object)) return
            if (!Guard.isIdentifier(mx.property)) return
            if (mx.object.name !== cfsn.identifier) return

            // typeguards still dont work inside arrow funcs(((((
            let ident = mx.property.name,
              i = -1

            if (
              (i = cfsn.literals.findIndex((l) => l.identifier === ident)) !==
              -1
            ) {
              // ident is a literal
              sp<Literal>(mx, {
                type: 'Literal',
                value: cfsn.literals[i].value,
              })
            }
          },
          CallExpression(cx) {
            if (!Guard.isMemberExpression(cx.callee)) return
            if (!Guard.isIdentifier(cx.callee.object)) return
            if (!Guard.isIdentifier(cx.callee.property)) return
            if (cx.callee.object.name !== cfsn.identifier) return

            let ident = cx.callee.property.name,
              i = -1

            if (
              (i = cfsn.functions.findIndex((f) => f.identifier === ident)) !==
              -1
            ) {
              // ident is a function
              const fx = cfsn.functions[i].node
              sp<Node>(cx, translateCallExp(fx, cx))
            }
          },
        })
      },
    })
    return this
  }

  public async transform(context: Context) {
    this.findStorageNode(context).replacer(context)
  }
}
