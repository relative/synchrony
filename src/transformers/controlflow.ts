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
  ObjectExpression,
  Statement,
  BlockStatement,
} from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import Context, { ControlFlowStorage } from '../context'
import {
  immutate,
  literalOrIdentifierToString,
  filterEmptyStatements,
} from '../util/helpers'

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

    const params = fx.params as Identifier[],
      paramMap = new Map<string, Node>()
    let i = 0
    for (const p of params) {
      paramMap.set(p.name, cx.arguments[i])
      ++i
    }
    let immRtn = immutate(fx.body.body[0].argument)
    walk(immRtn, {
      Identifier(id) {
        const node = paramMap.get(id.name)
        if (!node) return
        sp<Node>(id, node)
      },
    })

    return immRtn as Node
  }

  private getStorageNode(
    context: Context,
    node: BlockStatement
  ): ControlFlowStorage | undefined {
    const bid = getBlockId(node)
    return context.controlFlowStorageNodes.get(bid)
  }

  // fixes empty object inits where there are setters in the same block
  populateEmptyObjects(context: Context) {
    walk(context.ast, {
      BlockStatement(node) {
        // find empty object decls
        walk(node, {
          VariableDeclarator(decl) {
            if (!Guard.isIdentifier(decl.id)) return
            if (!decl.init || !Guard.isObjectExpresesion(decl.init)) return

            if (decl.init.properties.length !== 0) return

            const objName = decl.id.name
            // now find the setters

            // TODO: this will break if the value is set with a value set
            // after the Object is defined
            walk(node, {
              ExpressionStatement(expr) {
                if (!Guard.isAssignmentExpression(expr.expression)) return
                let ae = expr.expression

                if (!Guard.isMemberExpression(ae.left)) return

                if (
                  !Guard.isIdentifier(ae.left.object) ||
                  !Guard.isIdentifier(ae.left.property)
                )
                  return

                if (ae.left.object.name !== objName) return

                let prop: Property = {
                  type: 'Property',
                  start: 0,
                  end: 0,
                  method: false,
                  shorthand: false,
                  computed: false,
                  key: ae.left.property,
                  value: ae.right,
                  kind: 'init',
                }
                ;(decl.init as ObjectExpression).properties.push(prop)

                // remove the ExpressionStatement
                ;(expr as any).type = 'EmptyStatement'

                context.log(
                  `${objName}.${ae.left.property.name} = ${ae.right.type}`
                )
              },
            })
          },
        })
      },
    })
    return this
  }

  // separate finding literals/functions from each other?
  // current way makes code a bit confusing to follow ^^
  findStorageNode(context: Context) {
    const { findStorageNodeAliases } = this
    walk(context.ast, {
      BlockStatement(node) {
        // /shrug
        let bid = getBlockId(node)

        let cfsn = context.controlFlowStorageNodes.get(bid)
        if (cfsn) return
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
                    (p.key.type === 'Literal' || p.key.type === 'Identifier') &&
                    literalOrIdentifierToString((p as any).key).length === 5
                )
              )
                continue

              cfsn = {
                identifier: decl.id.name,
                aliases: [decl.id.name],
                functions: [],
                literals: [],
              }
              context.controlFlowStorageNodes.set(bid, cfsn)
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

            // the declaration should probably be removed only after the usages
            // are replaced, so there is no dep on each key being 5chars
            // or walk the node for Identifier usages and check parent is not
            // a CallExpr or MembExpr
            vd.declarations = vd.declarations.filter(
              (d) => !rm.includes(`${d.start}!${d.end}`)
            )
            if (vd.declarations.length === 0) {
              // this node wont generate if it has no declarations left
              ;(vd as any).type = 'EmptyStatement'
            }

            findStorageNodeAliases(context, node).replacer(context, node)
          },
        })
      },
    })
    return this
  }

  findStorageNodeAliases = (context: Context, ast: Node) => {
    walk(ast, {
      BlockStatement: (node) => {
        if (node.body.length === 0) return
        const cfsn = this.getStorageNode(context, node)
        if (!cfsn) return

        walk(node, {
          VariableDeclaration(vd) {
            let rm: string[] = []
            for (const decl of vd.declarations) {
              if (
                !decl.init ||
                !Guard.isIdentifier(decl.id) ||
                !Guard.isIdentifier(decl.init)
              )
                continue
              if (cfsn.aliases.includes(decl.init.name)) {
                cfsn.aliases.push(decl.id.name)
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

  replacer = (context: Context, ast: Node) => {
    const { translateCallExp } = this
    walk(ast, {
      BlockStatement: (node) => {
        const cfsn = this.getStorageNode(context, node)
        if (!cfsn) return
        walk(node, {
          MemberExpression(mx) {
            if (!Guard.isIdentifier(mx.object)) return
            if (!Guard.isIdentifier(mx.property)) return
            if (!cfsn.aliases.includes(mx.object.name)) return

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
            if (!cfsn.aliases.includes(cx.callee.object.name)) return

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

  deflatten(context: Context) {
    walk(context.ast, {
      WhileStatement(node, _, ancestors) {
        if (!Guard.isLiteralBoolean(node.test) || node.test.value !== true)
          return
        if (
          !Guard.isBlockStatement(node.body) ||
          node.body.body.length === 0 ||
          !Guard.isSwitchStatement(node.body.body[0])
        )
          return

        const parent = ancestors[ancestors.length - 2]
        if (!Guard.isBlockStatement(parent)) return

        const switchStmt = node.body.body[0]

        if (!Guard.isMemberExpression(switchStmt.discriminant)) return
        if (
          !Guard.isIdentifier(switchStmt.discriminant.object) ||
          !Guard.isUpdateExpression(switchStmt.discriminant.property) ||
          switchStmt.discriminant.property.operator !== '++' ||
          switchStmt.discriminant.property.prefix !== false || // prefix ++s change "return" of updexp
          !Guard.isIdentifier(switchStmt.discriminant.property.argument)
        )
          return

        let shuffleId = switchStmt.discriminant.object.name,
          indexId = switchStmt.discriminant.property.argument.name
        let shuffleArr: string[] = [],
          startIdx = -1

        walk(parent, {
          VariableDeclaration(vd) {
            let rm: string[] = []
            for (const decl of vd.declarations) {
              if (!Guard.isIdentifier(decl.id)) continue
              if (!decl.init) continue
              if (decl.id.name === shuffleId) {
                if (!Guard.isCallExpression(decl.init)) continue
                if (!Guard.isMemberExpression(decl.init.callee)) continue
                if (!Guard.isLiteralString(decl.init.callee.object)) continue
                if (
                  !Guard.isIdentifier(decl.init.callee.property) ||
                  decl.init.callee.property.name !== 'split'
                )
                  continue
                if (!Guard.isLiteralString(decl.init.arguments[0])) continue
                // 'nXnXnXnXn'.split(X)
                let shfStr = decl.init.callee.object.value,
                  sep = decl.init.arguments[0].value
                shuffleArr = shfStr.split(sep)
                rm.push(`${decl.start}!${decl.end}`)
              } else if (decl.id.name === indexId) {
                if (!Guard.isLiteralNumeric(decl.init)) continue
                startIdx = decl.init.value
                rm.push(`${decl.start}!${decl.end}`)
              } else {
                continue
              }
            }

            vd.declarations = vd.declarations.filter(
              (d) => !rm.includes(`${d.start}!${d.end}`)
            )
            if (vd.declarations.length === 0) {
              ;(vd as any).type = 'EmptyStatement'
            }
          },
        })

        // didnt locate arr or index
        if (shuffleArr.length === 0 || startIdx === -1) return

        let nodes: Statement[][] = []

        for (let i = startIdx; i < shuffleArr.length; i++) {
          let caseNum = shuffleArr[i]
          let caze = switchStmt.cases.find(
            (c) => c.test && Guard.isLiteral(c.test) && c.test.value === caseNum
          )
          if (!caze) return // should restore the variables above before returning
          nodes.push(
            caze.consequent.filter((i) => i.type !== 'ContinueStatement')
          )
        }

        let ourIdx = parent.body.findIndex(
          (e) =>
            e.type === node.type && e.start === node.start && e.end === node.end
        )
        parent.body.splice(ourIdx, 1, ...nodes.flat())

        context.log(
          'Found flattened control flow arr =',
          shuffleArr,
          'idx =',
          startIdx
        )
      },
    })

    return this
  }

  public async transform(context: Context) {
    this.populateEmptyObjects(context)
      .findStorageNode(context)
      .deflatten(context)
  }
}
