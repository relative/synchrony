import {
  Program,
  BlockStatement,
  sp,
  Function,
  ReturnStatement,
  Statement,
  AssignmentExpression,
  CallExpression,
  FunctionDeclaration,
  Identifier,
  Pattern,
  ExpressionStatement,
  FunctionExpression,
} from '../util/types'
import { Transformer, TransformerOptions } from './transformer'
import { walk } from '../util/walk'
import * as Guard from '../util/guard'
import Context from '../context'

export interface DemangleOptions extends TransformerOptions {}
export default class Demangle extends Transformer<DemangleOptions> {
  constructor(options: Partial<DemangleOptions>) {
    super('Demangle', options)
  }

  // demangles proxy functions to match schema required by StringDecoder
  // for now, only fixes 2 length funcs.
  demangleProxies(context: Context) {
    function visitor(func: Function) {
      if (!Guard.isBlockStatement(func.body)) return
      if (func.body.body.length !== 2) return
      let body = func.body.body

      // return is (func_name = function(){return any})()
      // callexpression callee AssignmentExpr left Ident right FuncExpression
      if (!Guard.isReturnStatement(body[body.length - 1])) return
      const retn = body[body.length - 1] as ReturnStatement

      if (!retn.argument) return
      let ae: AssignmentExpression, cx: CallExpression

      if (Guard.isSequenceExpression(retn.argument)) {
        if (!Guard.isAssignmentExpression(retn.argument.expressions[0])) return
        if (!Guard.isCallExpression(retn.argument.expressions[1])) return
        ae = retn.argument.expressions[0]
        cx = retn.argument.expressions[1]
      } else if (Guard.isCallExpression(retn.argument)) {
        if (!Guard.isAssignmentExpression(retn.argument.callee)) return
        ae = retn.argument.callee
        cx = retn.argument
      } else {
        return
      }

      if (!Guard.isIdentifier(ae.left)) return
      if (!Guard.isFunctionExpression(ae.right)) return

      let nb = [
        body[0],
        {
          type: 'ExpressionStatement',
          expression: ae,
        },
        {
          type: 'ReturnStatement',
          argument: {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: ae.left.name,
            },
            arguments: cx.arguments,
          },
        },
      ]
      // update
      sp<BlockStatement>(func.body, {
        body: nb as Statement[],
      })
    }
    walk(context.ast, {
      FunctionDeclaration: visitor,
      FunctionExpression: visitor,
      ArrowFunctionExpression: visitor,
    })
    return this
  }

  // moves strArray[(idx - offset)] to an AssignExp above it
  demangleStringFuncs(context: Context) {
    function visitor(func: FunctionDeclaration) {
      if (!Guard.isBlockStatement(func.body)) return
      if (!func.id) return
      if (func.body.body.length !== 3) return
      let body = func.body.body
      if (
        !Guard.isExpressionStatement(body[1]) ||
        !Guard.isAssignmentExpression(body[1].expression)
      )
        return

      if (!Guard.isIdentifier(body[1].expression.left)) return
      if (body[1].expression.left.name !== func.id.name) return
      if (!Guard.isFunctionExpression(body[1].expression.right)) return

      let fx = body[1].expression.right,
        fxb = fx.body.body
      let nb: Statement[] = []
      // extracts offset setter
      if (!Guard.isVariableDeclaration(fxb[0])) return
      if (fxb[0].declarations.length !== 1) return
      if (!fxb[0].declarations[0].init) return
      if (!Guard.isMemberExpression(fxb[0].declarations[0].init)) return
      if (!Guard.isAssignmentExpression(fxb[0].declarations[0].init.property))
        return
      if (!Guard.isIdentifier(fxb[0].declarations[0].init.property.left)) return
      if (!Guard.isLiteralNumeric(fxb[0].declarations[0].init.property.right))
        return
      if (fxb[0].declarations[0].init.property.operator !== '-=') return

      const offsetId = fxb[0].declarations[0].init.property.left.name,
        offsetVal = fxb[0].declarations[0].init.property.right.value
      nb.push({
        type: 'ExpressionStatement',
        expression: {
          type: 'AssignmentExpression',
          operator: '=',
          left: {
            type: 'Identifier',
            name: offsetId,
          },
          right: {
            type: 'BinaryExpression',
            operator: '-',
            left: {
              type: 'Identifier',
              name: offsetId,
            },
            right: {
              type: 'Literal',
              value: offsetVal,
            },
          },
        },
      } as ExpressionStatement)

      sp<Identifier>(fxb[0].declarations[0].init.property, {
        type: 'Identifier',
        name: offsetId,
      })
      nb = [...nb, ...fxb]
      // this could definitely be wrote better lol
      // this extracts charsets etc
      if (fxb.length >= 3) {
        // possibly B64/RC4 type decoder
        if (Guard.isIfStatement(nb[2])) {
          let ifst = nb[2]
          if (
            Guard.isBlockStatement(ifst.consequent) &&
            ifst.consequent.body.length > 1 // maybe ==2
          ) {
            if (
              (Guard.isVariableDeclaration(ifst.consequent.body[0]) &&
                ifst.consequent.body[0].declarations.length > 0 &&
                ifst.consequent.body[0].declarations[0].init &&
                Guard.isFunctionExpression(
                  ifst.consequent.body[0].declarations[0].init
                )) ||
              (Guard.isExpressionStatement(ifst.consequent.body[0]) &&
                Guard.isAssignmentExpression(
                  ifst.consequent.body[0].expression
                ) &&
                Guard.isMemberExpression(
                  ifst.consequent.body[0].expression.left
                ) &&
                Guard.isIdentifier(
                  ifst.consequent.body[0].expression.left.object
                ) &&
                Guard.isIdentifier(
                  ifst.consequent.body[0].expression.left.property
                ) &&
                Guard.isFunctionExpression(
                  ifst.consequent.body[0].expression.right
                ))
            ) {
              let dfx: FunctionExpression = (
                  Guard.isExpressionStatement(ifst.consequent.body[0])
                    ? (
                        ifst.consequent.body[0]
                          .expression as AssignmentExpression
                      ).right
                    : ifst.consequent.body[0].declarations[0].init
                ) as FunctionExpression,
                dfxb = dfx!.body.body
              if (dfxb.length > 1) {
                if (
                  Guard.isForStatement(dfxb[0]) &&
                  Guard.isBlockStatement(dfxb[0].body)
                ) {
                  if (Guard.isExpressionStatement(dfxb[0].body.body[0])) {
                    if (
                      Guard.isAssignmentExpression(
                        dfxb[0].body.body[0].expression
                      )
                    ) {
                      if (
                        Guard.isCallExpression(
                          dfxb[0].body.body[0].expression.right
                        )
                      ) {
                        if (
                          Guard.isMemberExpression(
                            dfxb[0].body.body[0].expression.right.callee
                          )
                        ) {
                          if (
                            dfxb[0].init &&
                            Guard.isVariableDeclaration(dfxb[0].init)
                          ) {
                            if (
                              dfxb[0].init.declarations[0].init &&
                              Guard.isLiteralString(
                                dfxb[0].init.declarations[0].init
                              )
                            ) {
                              let charset =
                                dfxb[0].init.declarations[0].init.value
                              if (charset.length === 65)
                                dfxb.splice(0, 0, {
                                  type: 'VariableDeclaration',
                                  kind: 'const',
                                  start: 0,
                                  end: 0,
                                  declarations: [
                                    {
                                      type: 'VariableDeclarator',
                                      id: {
                                        type: 'Identifier',
                                        name: 'charset',
                                      } as Pattern,
                                      init: {
                                        type: 'Literal',
                                        value: charset,
                                      },
                                      start: 0,
                                      end: 0,
                                    },
                                  ],
                                })
                            } else if (
                              Guard.isLiteralString(
                                dfxb[0].body.body[0].expression.right.callee
                                  .object
                              ) &&
                              Guard.isIdentifier(
                                dfxb[0].body.body[0].expression.right.callee
                                  .property
                              ) &&
                              dfxb[0].body.body[0].expression.right.callee
                                .property.name === 'indexOf'
                            ) {
                              // this is if the charset gets moved (it won't)
                              // just in case though
                              let charset =
                                dfxb[0].body.body[0].expression.right.callee
                                  .object.value
                              if (charset.length === 65)
                                dfxb.splice(0, 0, {
                                  type: 'VariableDeclaration',
                                  kind: 'const',
                                  start: 0,
                                  end: 0,
                                  declarations: [
                                    {
                                      type: 'VariableDeclarator',
                                      id: {
                                        type: 'Identifier',
                                        name: 'charset',
                                      } as Pattern,
                                      init: {
                                        type: 'Literal',
                                        value: charset,
                                      },
                                      start: 0,
                                      end: 0,
                                    },
                                  ],
                                })
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

            // push RC4 function to its own variable
            if (
              Guard.isVariableDeclaration(ifst.consequent.body[0]) &&
              ifst.consequent.body[0].declarations.length === 2
            ) {
              ifst.consequent.body.splice(1, 0, {
                type: 'VariableDeclaration',
                start: 0,
                end: 0,
                kind: ifst.consequent.body[0].kind,
                declarations: [ifst.consequent.body[0].declarations[1]],
              })
            }
          }
        }
      }

      sp<BlockStatement>(fx.body, {
        body: nb as Statement[],
      })
    }
    walk(context.ast, {
      FunctionDeclaration: visitor,
    })
    return this
  }

  public async transform(context: Context) {
    this.demangleProxies(context).demangleStringFuncs(context)
  }
}
