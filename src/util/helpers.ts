// Immutability™™™™™™
export function immutate(item: any) {
  return JSON.parse(JSON.stringify(item))
}
