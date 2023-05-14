const { default: generate } = require('@babel/generator'),
  { default: template } = require('@babel/template'),
  t = require('@babel/types')

const tplProgram = template.program(
  `import { EqualityComparator, deepEquality } from '~/util/equality'
import { NodePath } from '@babel/traverse'
import * as t from '~/types'

%%exports%%`,
  {
    plugins: ['typescript'],
  }
)

const tplDeepNodeEqualityFn = template(
  `export function %%functionName%%<TExtracted = unknown>(
  path: NodePath<t.Node> | null | undefined,
  opts?: EqualityComparator<t.%%idNodeType%%>,
  out?: TExtracted
): path is NodePath<t.%%idNodeType%%> {
  if (!path || path.type !== %%strNodeType%%) return false

  return opts == null || deepEquality(path.node, opts, out)
}`,
  {
    plugins: ['typescript'],
  }
)

module.exports = () => {
  const NodeTypes = t.TYPES.filter(k => !t.FLIPPED_ALIAS_KEYS[k])

  const program = tplProgram({
    exports: NodeTypes.map(nodeType =>
      tplDeepNodeEqualityFn({
        functionName: t.identifier(`deepIs${nodeType}`),
        idNodeType: t.identifier(nodeType),
        strNodeType: t.stringLiteral(nodeType),
      })
    ),
  })
  return generate(program).code
}
