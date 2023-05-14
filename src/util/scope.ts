import { Binding } from '@babel/traverse'

export function bindingIsReferenced(bind: Binding, checkDescendants = false): boolean {
  bind.scope.crawl()
  const newBind = bind.scope.getBinding(bind.identifier.name)
  if (!newBind) return false

  let referenced = newBind.referenced

  if (checkDescendants && referenced) {
    referenced = newBind.referencePaths.every(p => !p.isDescendant(newBind.path))
  }

  return referenced
}
