export function defaultLogger(
  type: 'log' | 'info' | 'warn' | 'error',
  ...data: any[]
): void {
  switch (type) {
    case 'log':
      console.log(...data)
      break
    case 'info':
      console.info(...data)
      break
    case 'warn':
      console.warn(...data)
      break
    case 'error':
      console.error(...data)
      break
  }
}

export type Logger = typeof defaultLogger

export function resolveLogger(logger?: Logger | boolean) {
  if (typeof logger === 'function') return logger
  else if (logger === false) return () => {}
  // if it's a weird type or if it's true
  else return defaultLogger
}
