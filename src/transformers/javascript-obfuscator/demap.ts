import { createTransformer } from '~/util/transform'
import * as t from '~/types'
import { z } from 'zod'
import { Binding, NodePath } from '@babel/traverse'
import { Context } from '~/context'
import { bindingIsReferenced } from '~/util/scope'
import { createFilterArray, zFilterArray } from '~/util/filter'

const schema = z.object({
  objectInclude: zFilterArray(),
  objectExclude: zFilterArray(),
})
declare global {
  namespace Synchrony {
    interface Transformers {
      'javascript-obfuscator/demap': z.input<typeof schema>
    }
  }
}

function fixFunctionCall(ctx: Context, cx: NodePath<t.CallExpression>, func: NodePath<t.FunctionExpression>) {
  const block = func.get('body')
  const body = block.get('body')
  if (body.length !== 1) return
  const [retn] = body
  if (!retn.isReturnStatement()) return

  const params = func.get('params')
  const args = cx.get('arguments')
  const paramToArg: Record<string, t.Node> = {}
  // TODO:
  if (params.length !== args.length) return

  for (let i = 0; i < params.length; ++i) {
    const param = params[i]
    if (!param.isIdentifier()) continue
    const arg = args[i]
    paramToArg[param.node.name] = arg.node
  }

  const retnVal = retn.get('argument')
  if (!retnVal?.node) return
  const result = t.cloneDeepWithoutLoc(retnVal.node)
  t.traverseFast(result, node => {
    if (t.isIdentifier(node)) {
      const nv = paramToArg[node.name]
      if (!nv) return
      Object.assign(node, nv)
    }
  })

  cx.replaceWith(result)
}

function getNextPath(paths: NodePath[], skippedPaths: NodePath[]): NodePath | undefined {
  if (skippedPaths.length === 0) return paths[0]
  for (let i = 0; i < paths.length; ++i) {
    const path = paths[i]
    const skipIdx = skippedPaths.indexOf(path)
    if (skipIdx === -1) return path
  }
  return undefined
}

function processBindingSetters(ctx: Context, bind: Binding) {
  if (!bind.path.isVariableDeclarator()) return
  const init = bind.path.get('init')
  if (!init.isObjectExpression()) return
  const properties = init.get('properties')
  if (properties.length !== 0) return

  const toSet: Record<
    string,
    {
      node: t.Expression
      path: NodePath<t.AssignmentExpression>
    }
  > = {}
  const ignoreKeys = new Set<string>()
  for (const ref of bind.referencePaths) {
    if (!ref.isIdentifier() || ref.key !== /* MemberExpression.object */ 'object') continue
    const { parentPath: mx } = ref
    if (!mx?.isMemberExpression() || mx.key !== /* AssignmentExpression.left */ 'left') continue
    const { parentPath: ax } = mx
    if (!ax?.isAssignmentExpression()) continue

    const propId = mx.get('property')
    if (!propId.isIdentifier()) continue

    const propName = propId.node.name
    const value = ax.get('right')
    if (!value) continue
    if (toSet[propName]) {
      ignoreKeys.add(propName)
    } else {
      toSet[propName] = {
        node: value.node,
        path: ax,
      }
    }
  }

  for (const propName in toSet) {
    if (ignoreKeys.has(propName)) continue
    const { node, path } = toSet[propName]

    const ident = t.isValidIdentifier(propName) ? t.identifier(propName) : t.stringLiteral(propName)
    const computed = !t.isIdentifier(ident)

    init.node.properties.push(t.objectProperty(ident, node, computed))
    path.remove()
  }
  bind.scope.crawl()

  // debugger
}

function processBinding(ctx: Context, bind: Binding) {
  if (!bind.path.isVariableDeclarator()) return
  const init = bind.path.get('init')
  if (!init.isObjectExpression()) return
  const properties = init.get('properties')
  const propObj: Record<string, NodePath<t.Expression | t.PatternLike>> = {}
  ctx.log.debug(`Checking binding ${bind.identifier.name}`)
  if (properties) {
    for (const prop of properties) {
      if (!prop.isObjectProperty()) continue
      const key = prop.get('key')
      if (!key.isIdentifier()) continue
      const value = prop.get('value')
      propObj[key.node.name] = value
    }
  }

  let newBind = bind.scope.getBinding(bind.identifier.name)
  if (!newBind) return
  ctx.log.info(`Processing binding ${newBind.identifier.name} (refs = ${newBind.references})`)
  const skipped: NodePath[] = []
  let ref: NodePath | undefined
  let iterations = 0
  const maxIterations = Math.max(bind.references * 10, 5000)
  do {
    if (++iterations > maxIterations) {
      throw new Error(
        `Potential infinite loop encountered while processing ${newBind.identifier.name} (iterations = ${iterations}, references = ${bind.references})`
      )
    }
    // ref = bind.referencePaths[0]
    ref = getNextPath(newBind.referencePaths, skipped)
    if (!ref) break
    const { parentPath: mx } = ref
    if (!mx?.isMemberExpression()) {
      skipped.push(ref)
      continue
    }
    const prop = mx.get('property')
    if (!prop.isIdentifier()) {
      skipped.push(ref)
      continue
    }

    const propName = prop.node.name
    const value = propObj[propName]
    if (!value) {
      skipped.push(ref)
      continue
    }
    const name = `${newBind.identifier.name}[${propName}]`
    ctx.log.debug(`Replacing reference to ${name} with ${value?.type}`)

    try {
      if (value.isFunctionExpression()) {
        const { parentPath: cx } = mx
        if (!cx.isCallExpression()) continue
        fixFunctionCall(ctx, cx, value)
        // debugger
      } else {
        // Object.assign(mx.node, value.node)
        mx.replaceWith(value)
      }
    } catch (err) {
      ctx.log.debug('Error on', name, err)
      skipped.push(ref)
      continue
    }

    // newBind.scope.parent?.crawl()
    newBind.scope.crawl()
    newBind = newBind.scope.getBinding(newBind.identifier.name)
    if (!newBind) return
  } while (ref)

  // TODO: revert based on skipped refs

  if (!bindingIsReferenced(newBind)) {
    newBind.path.remove()
  }
}

export default createTransformer('javascript-obfuscator/demap', {
  schema,

  run(ctx, opts) {
    const objectFilter = createFilterArray(opts.objectInclude, opts.objectExclude)
    ctx.traverse({
      VariableDeclarator(p) {
        const id = p.get('id')
        if (!id.isIdentifier()) return
        const { name } = id.node
        if (!objectFilter.isIncluded(name)) return
        const bind = p.scope.getBinding(name)
        if (!bind) return
        // bind.scope.parent?.crawl()
        const init = p.get('init')
        if (!init.isObjectExpression()) return
        const props = init.get('properties')
        for (const prop of props) {
          if (!prop.isObjectProperty()) continue
          const key = prop.get('key')
          if (key.isStringLiteral()) {
            const name = key.node.value
            if (t.isValidIdentifier(name)) key.replaceWith(t.identifier(name))
          }
        }
        processBindingSetters(ctx, bind)
        processBinding(ctx, bind)
      },
    })
  },
})
