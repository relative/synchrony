export function whileGuard<T extends (...args: A) => boolean, A extends any[]>(
  fn: T,
  maxIters: number,
  ...args: A
): void {
  let iterations = 0
  let again = false
  do {
    if (++iterations > maxIters) throw new Error('Max iterations exceeded')
    again = fn(...args)
  } while (again)
}
