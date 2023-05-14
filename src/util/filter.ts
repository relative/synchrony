import { z } from 'zod'

export const zRegExp = () =>
  z.custom<RegExp>(d => {
    return d instanceof RegExp
  }, {})

export const zFilterArray = () => z.union([z.string(), zRegExp()]).array().default([])

type FilterArray = ReturnType<typeof zFilterArray>['_output']

export interface IFilterArray {
  include: FilterArray
  exclude: FilterArray

  isIncluded(element: string, explicit?: boolean): boolean
  isExcluded(element: string): boolean
}

function checkEntries(array: FilterArray, element: string): boolean {
  for (const c of array) {
    if (typeof c === 'string') {
      if (c === element) return true
    } else if (c instanceof RegExp) {
      if (element.match(c)) return true
    }
  }
  return false
}

export function createFilterArray(include: FilterArray = [], exclude: FilterArray = []): IFilterArray {
  return {
    include,
    exclude,

    isIncluded(element, explicit = false) {
      if (this.isExcluded(element)) return false
      if (!this.include.length && !explicit) return true
      return checkEntries(this.include, element)
    },
    isExcluded(element) {
      if (!this.exclude.length) return false
      return checkEntries(this.exclude, element)
    },
  }
}
