import { isLiteral, isIdentifier } from './guard'
import { Node, EmptyStatement, Literal, Identifier } from './types'

// Immutability™™™™™™
export function immutate(item: any) {
  return JSON.parse(JSON.stringify(item))
}

export function literalOrIdentifierToString(node: Node): string {
  if (!isLiteral(node) && !isIdentifier(node))
    throw new TypeError('Node is not Literal or Identifier')
  return isLiteral(node) ? node.value!.toString() : node.name
}

export function filterEmptyStatements(nodes: Node[]): Node[] {
  return nodes.filter((i) => i.type !== 'EmptyStatement')
}
