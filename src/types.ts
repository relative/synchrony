export * from '@babel/types'

export type MaybePromise<T> = T | Promise<T> | PromiseLike<T>
