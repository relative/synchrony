// shh
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { deepIsExpressionStatement } from 'generated:nodePathEquality'
import { es } from '~/util/equality'
import { Binding, NodePath } from '@babel/traverse'
import { Context, getContext } from '~/context'
import { foldConstants } from '~/public/foldConstants'
import { removeDeadCode } from '~/public/deadCode'
import { bindingIsReferenced } from '~/util/scope'
import { createLiteral } from '~/util/translator'
import { whileGuard } from '~/public/wg'

const schema = z.object({})
declare global {
  namespace Synchrony {
    interface Transformers {
      'jsconfuser/unstack': z.input<typeof schema>
    }
  }
}

interface TObj {
  stackId: string
  bind: Binding
  props: Record<ObjPropKey, t.Identifier>

  crawlScope(): void
}

const argIdentifier = (index: number, prefix = 'arg') => t.identifier(`${prefix}${index.toString()}`)
type ObjPropKey = string | number
function getMxProperty(obj: TObj, mx: NodePath<t.MemberExpression>, inside = false): ObjPropKey | null {
  const prop = mx.get('property')

  if (inside) {
    let shouldRerun = false
    do {
      shouldRerun = run(
        getContext(mx),
        obj,
        obj.bind.referencePaths.filter(p => p.isDescendant(prop)),
        false
      )
      prop.scope.crawl()
      fixVariables(getContext(prop), prop, obj)
    } while (shouldRerun)
    // foldConstants(prop)
  }
  const { confident, value } = prop.evaluate()
  if (!confident) return null
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  if (isNaN(value)) {
    debugger
    throw new Error('give up')
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null
  return value
}

function getPropId(
  func: NodePath<t.Function>,
  obj: TObj,
  mx: NodePath<t.MemberExpression>,
  prefix = 'var'
): [t.Identifier, boolean] {
  const prop = getMxProperty(obj, mx)
  if (prop === null) throw new Error('give up')
  if (obj.props[prop]) return [obj.props[prop], false]

  const id = func.scope.generateUidIdentifier(prefix)

  return [id, true]
}

function run(ctx: Context, obj: TObj, paths: NodePath[], ssu = false): boolean {
  let shouldRerun = false
  for (const ref of paths) {
    const { parentPath: mx } = ref
    if (!mx?.isMemberExpression()) continue

    const prop = getMxProperty(obj, mx)
    if (prop === null) continue

    if (obj.props[prop]) {
      mx.replaceWith(obj.props[prop])
      shouldRerun = true
    } else {
      // if (prop !== 0) continue
      if (ssu) {
        ctx.log.debug('prop', prop, 'is not defined')

        mx.replaceWith(t.identifier('undefined'))
        shouldRerun = true
      }
    }
  }
  return shouldRerun
}

type ValidSetter = NodePath<t.VariableDeclarator | t.AssignmentExpression>
type ValidSetters = ValidSetter[]
function getSetter(setters: ValidSetters, path: NodePath): NodePath | undefined {
  if (setters.length === 0) return undefined
  if (setters.length === 1) return setters[0]
  let last: ValidSetter | undefined
  for (const s of setters) {
    if (!s.willIMaybeExecuteBefore(path)) break
    last = s
  }
  if (!last) return undefined
  if (last.isVariableDeclarator()) {
    const init = last.get('init')
    if (!init.isExpression()) return undefined
    return init
  } else if (last.isAssignmentExpression()) {
    return last.get('right')
  }
  return undefined
}
function fixVariables(ctx: Context, path: NodePath, obj: TObj): boolean {
  let updatedAnything = false
  for (const prop of Object.values(obj.props)) {
    const p = obj.bind.scope.getBinding(prop.name)
    if (!p) continue

    if (p.constant) continue

    if (p.referenced) {
      // if (!p.path.isVariableDeclarator()) continue
      const setters = [p.path, ...p.constantViolations] as unknown as ValidSetters
      if (!setters.every(p => p.isVariableDeclarator() || p.isAssignmentExpression())) continue

      for (const ref of p.referencePaths) {
        // if (!ref.isDescendant(path) && path !== ref) continue
        const setter = getSetter(setters, ref)
        if (!setter) break

        const orig = t.cloneDeepWithoutLoc(ref.node)
        ref.replaceWith(t.cloneDeepWithoutLoc(setter.node))
        const { confident, value } = ref.evaluate()
        const literal = createLiteral(value)
        if (!confident || !literal) {
          ref.replaceWith(orig)
        } else {
          ref.replaceWith(literal)
          updatedAnything = true
        }
      }
    }
  }
  obj.crawlScope()
  return updatedAnything
}

function test(ctx: Context, func: NodePath<t.Function>, obj: TObj): boolean {
  const block = func.get('body')
  if (!block.isBlockStatement()) return false

  obj.crawlScope()

  // let shouldRerun = run(ctx, obj, obj.bind.referencePaths)
  let shouldRerun = false

  for (const ref of obj.bind.referencePaths) {
    const { parentPath: mx } = ref
    if (!mx?.isMemberExpression()) continue

    const { parentPath: ax } = mx
    if (ax?.isAssignmentExpression() && mx.key === 'left') {
      const prop = getMxProperty(obj, mx, true)
      if (prop === null) continue

      const [id, justCreated] = getPropId(func, obj, mx)

      // fixVariables(ctx, ax.get('right'), obj)

      ctx.log.debug('Setup', id.name, '=', ax.get('right').toString())

      obj.props[prop] = id

      if (ax.parentPath.isExpressionStatement() && ax.node.operator === '=') {
        if (justCreated) {
          ax.parentPath.replaceWith(t.variableDeclaration('let', [t.variableDeclarator(id, ax.get('right').node)]))
        }
      } else {
        mx.replaceWith(id)
      }
    }
  }

  obj.crawlScope()

  // only set it to true
  shouldRerun = run(ctx, obj, obj.bind.referencePaths, false) || shouldRerun

  obj.crawlScope()
  whileGuard(fixVariables, 10, ctx, obj.bind.path, obj)

  // foldConstants(func)
  obj.crawlScope()

  return shouldRerun
  // if (shouldRerun) test(ctx, func, obj)
  // else {
  //   // set the rest to undefined i guess lol idk
  //   run(ctx, obj, obj.bind.referencePaths, true)
  //   obj.crawlScope()
  //   removeDeadCode(func)
  //   func.scope.crawl()
  // }
}

/**
 * reverse "stack" feature of JS-confuser
 */
export default createTransformer('jsconfuser/unstack', {
  schema,

  run(ctx) {
    ctx.traverse({
      Function(p) {
        const params = p.get('params')
        if (params.length !== 1) return
        const [stackRest] = params
        if (!stackRest.isRestElement()) return
        const stackIdPath = stackRest.get('argument')
        if (!stackIdPath.isIdentifier()) return

        const stackId = stackIdPath.node.name

        const block = p.get('body')
        if (!block.isBlockStatement()) return

        const body = block.get('body')

        if (body.length < 2) return

        const [lenAx] = body
        const out = {} as { functionParamCount: number }
        if (
          !deepIsExpressionStatement(
            lenAx,
            {
              expression: {
                type: 'AssignmentExpression',
                left: t.memberExpression(t.identifier(stackId), t.identifier('length'), false),
                operator: '=',
                right: {
                  type: 'NumericLiteral',
                  value: es('functionParamCount'),
                },
              },
            },
            out
          )
        )
          return

        const origFunc = t.cloneDeepWithoutLoc(p.node)
        try {
          // remove the stack param
          stackRest.remove()
          // create parameters for starting
          p.pushContainer(
            'params',
            Array.from({ length: out.functionParamCount }).map((_, i) => argIdentifier(i))
          )

          lenAx.replaceWith(
            t.variableDeclaration('const', [t.variableDeclarator(t.identifier(stackId), t.arrayExpression([]))])
          )

          p.scope.crawl()

          const stackBind = p.scope.getBinding(stackId)
          if (!stackBind) return
          const obj: TObj = {
            stackId,
            bind: stackBind,
            props: {},

            crawlScope() {
              this.bind.scope.crawl()
              this.bind = this.bind.scope.getBinding(stackId)!
            },
          }

          for (let i = 0; i < out.functionParamCount; ++i) {
            obj.props[i] = argIdentifier(i)
          }

          whileGuard(test, 1000, ctx, p, obj)
          // test(ctx, p, obj)

          // set the rest to undefined i guess lol idk
          run(ctx, obj, obj.bind.referencePaths, true)
          obj.crawlScope()
          foldConstants(p)
          removeDeadCode(p)
          p.scope.crawl()

          if (!bindingIsReferenced(stackBind)) {
            stackBind.path.remove()
          }
        } catch (err) {
          ctx.log.warn('unstack failed for this function', err)
          p.replaceWith(origFunc)
          p.skip()
        }
      },
    })
  },
})
