const glob = require('glob'),
  { basename, join } = require('path'),
  fs = require('fs/promises')

const defaultOptions = {
  files: [],
  outdir: '',
}

/**
 * Creates virtual generated modules
 * @param {{
 *    files: string[]
 *    outdir: string
 * }} opts
 * @returns {import('esbuild').Plugin}
 */
function esbuildPluginCopyFiles(opts = defaultOptions) {
  opts = Object.assign({}, defaultOptions, opts)

  const { files, outdir } = opts

  return {
    name: 'copyfiles',
    setup(build) {
      build.onEnd(async () => {
        for (const f of files) {
          const arr = glob.sync(f, {
            absolute: true,
            windowsPathsNoEscape: true,
          })
          for (const p of arr) {
            const name = basename(p)
            await fs.copyFile(p, join(outdir, name))
          }
        }
      })
    },
  }
}

module.exports = esbuildPluginCopyFiles
