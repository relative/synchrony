const { Worker } = require('worker_threads')

const defaultOptions = {
  isWatch: false,
  shouldBlockWatch: false,
}

/**
 * Emits type declarations after build completes
 * @param {{
 *    isWatch: boolean
 *    shouldBlockWatch: boolean
 * }} opts
 * @returns {import('esbuild').Plugin}
 */
function esbuildPluginTsc(opts = defaultOptions) {
  opts = Object.assign({}, defaultOptions, opts)

  const { isWatch, shouldBlockWatch } = opts

  /**
   * @type {Worker}
   */
  let lastWorker = null

  const emitTypes = () =>
    new Promise(async (resolve, reject) => {
      // shh
      if (lastWorker) {
        lastWorker.removeAllListeners('exit')
        await lastWorker.terminate()
      }

      const worker = new Worker(require.resolve('ts-patch/lib/tsc'), {
        argv: ['-p', 'tsconfig.json', '--emitDeclarationOnly', '--declaration'],
        stderr: false,
        stdout: false,
      })
      worker
        .on('error', err => {
          console.warn('Error in tsc worker', err)
        })
        .on('exit', code => {
          if (code !== 0) return reject(new Error(`tsc exited with code ${code}`))
          resolve()
        })

      lastWorker = worker
    })

  return {
    name: 'tsc',
    setup(build) {
      build.onStart(async () => {
        if (lastWorker) {
          lastWorker.removeAllListeners('exit')
          await lastWorker.terminate()
          lastWorker = null
        }
      })
      build.onEnd(async () => {
        try {
          console.log('Building type declarations ===')
          if (isWatch && shouldBlockWatch) {
            await emitTypes()
          } else {
            emitTypes().catch(e => {})
          }
        } catch (err) {
          return {
            warnings: [
              {
                text: err.message,
                pluginName: this.name,
              },
            ],
          }
        }
      })
    },
  }
}

module.exports = esbuildPluginTsc
