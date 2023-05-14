const { Worker } = require('worker_threads')

/**
 * Emits type declarations after build completes
 * @param {object} opts
 * @returns {import('esbuild').Plugin}
 */
function esbuildPluginTsc(opts = {}) {
  opts = Object.assign({}, {}, opts)

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
          await emitTypes()
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
