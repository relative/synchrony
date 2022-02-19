import { Node, EmptyStatement } from './types'

// Immutability™™™™™™
export function immutate(item: any) {
  return JSON.parse(JSON.stringify(item))
}

export function filterEmptyStatements(nodes: Node[]): Node[] {
  return nodes.filter((i) => i.type !== 'EmptyStatement')
}
