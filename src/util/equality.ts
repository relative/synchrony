import * as t from '~/types'

export type EqualityComparator<T> = ExtractSpecifier<string> | (T extends t.Node ? PartialNode<T> : Partial<T>)

// prettier-ignore
export type PartialNode<TNode extends Array<t.Node> | t.Node | undefined | null> = {
  [P in keyof TNode]?: 
    ExtractSpecifier<string> | (
      TNode[P] extends Array<infer U> ? ArrayEqualityObj<U> | Array<EqualityComparator<U>> :
      TNode[P] extends t.Node | null | undefined ? EqualityComparator<TNode[P]> :
      TNode[P]
    )
    // TNode[P] extends t.Node | undefined | null ? EqualityComparator<TNode[P]>
}

export enum ArrayMode {
  Exact,
  Some,
}

//#region Extract
// Send help plerase please please please pleae aspl eaplaelpsae

// type NonExtracts<T> = { [K in keyof T as T[K] extends ExtractSpecifier<infer U> ? never : K]-?: T[K] }
// // prettier-ignore
// type ExtractType<CV, IV> =
//   CV extends ExtractSpecifier<infer U extends string> ? [U, IV] & [string, unknown] :
//   //
//   CV extends Array<infer U> ? {
//     [K in keyof U]: IV extends Array<infer Y> ? ExtractType<U[K], Y[keyof Y & K][]> : [never, never]
//   } [keyof U] & [string, unknown] :
//   //
//   CV extends object ? {
//     [K in keyof CV]:
//       IV extends NonExtracts<CV> ? ExtractType<CV[K], IV[keyof IV & K]> :
//       ExtractType<CV[K], IV[keyof IV & K]>
//   }[keyof CV] & [string, unknown] :
//   //
//   never

// type ExtractDict<C extends object, I extends object> = {
//   [P in ExtractType<C, I> as string & P[0]]: P[1]
// }
type ExtractSpecifier<T extends string> = `$extract.${T}`
export function es<T extends string>(t: T): ExtractSpecifier<T> {
  return `$extract.${t}`
}

//#endregion

//#region Array equality
const SymArrayEquality = Symbol('ArrayEquality')
export interface ArrayEqualityObj<T> {
  items: Array<T>
  mode: ArrayMode
  [SymArrayEquality]: true
}
export function ae<T extends t.Node>({
  items = [],
  mode = ArrayMode.Exact,
}: Partial<Omit<ArrayEqualityObj<T>, typeof SymArrayEquality>>): ArrayEqualityObj<T> {
  return { items, mode, [SymArrayEquality]: true }
}
function objIsAe<T extends t.Node | null | undefined>(obj?: unknown): obj is ArrayEqualityObj<T> {
  if (!obj) return false
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return (obj as any)[SymArrayEquality] === true
}
function arrayEquality<TExtracted, T, K extends keyof T>(
  node: T,
  opts: EqualityComparator<T>,
  key: K,
  oval: Array<t.Node>,
  { mode, items }: ArrayEqualityObj<t.Node>,
  out?: TExtracted
): boolean {
  switch (mode) {
    case ArrayMode.Exact:
      if (oval.length !== items.length) return false
      for (let i = 0; i < oval.length; ++i) {
        if (!deepEquality(oval[i], items[i], out)) return false
      }
      return true
    case ArrayMode.Some:
      break
  }
  return false
}
//#endregion

// ExtractDict<Comparator, T>
// export function deepEquality<TExtracted, T = unknown, Comparator extends EqualityComparator<T> = EqualityComparator<T>>(
//   node: T,
//   opts: Comparator
// ): false | TExtracted
/* eslint-disable */
export function deepEquality<
  TExtracted = object,
  T = unknown,
  Comparator extends EqualityComparator<T> = EqualityComparator<T>
>(node: T, opts: Comparator, out?: TExtracted): boolean {
  const toAddToOut: Record<string, any[]> = {}
  for (const key of Object.keys(opts) as (keyof T)[]) {
    // @ts-expect-error eeeeeeeeeeeeeeeeeee idk
    const val = opts[key],
      nval = node[key]
    if (typeof val === 'string' && val.startsWith('$extract.')) {
      const extractKey = val.substring('$extract.'.length)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      toAddToOut[extractKey] = [...(toAddToOut[extractKey] || []), nval]
    } else if (typeof val === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (objIsAe<t.Node>(val)) {
        if (!arrayEquality(node, opts, key, nval as Array<t.Node>, val as unknown as ArrayEqualityObj<t.Node>, out))
          return false
      } else {
        if (val) {
          if (!deepEquality(nval, val, out)) return false
        }
      }
    } else {
      if (nval !== val) return false
    }
  }
  if (typeof out !== 'undefined' && !!out) {
    for (const key in toAddToOut) {
      const val = toAddToOut[key]
      // @ts-expect-error aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      if (Array.isArray(out[key])) {
        if (Array.isArray(val[0])) {
          // @ts-expect-error asdadasdsadsa
          out[key] = val[0]
        } else {
          // @ts-expect-error nyayanyanynynaynaynayaynaynaynayn
          out[key].push(...val)
        }
      } else {
        // @ts-expect-error aaaaaaaaaaaaa
        out[key] = val[0]
      }
    }
  }
  return true
  // for (const [key, val] of Object.entries(opts)) {
  //   if (typeof val === 'object') {
  //     if (!deepEquality(node[key], val))
  //   }
  // }
}
/* eslint-enable */
