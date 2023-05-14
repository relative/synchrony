/**
 * @param {boolean} watch - Whether this build is watch mode or not
 * @returns {import('esbuild').Plugin}
 */
function esbuildPluginProblemMatcher(watch = false) {
  return {
    name: 'esbuild-problem-matcher',

    setup(build) {
      if (watch) build.onStart(() => console.log('[watch] build started'))

      build.onEnd(result => {
        if (result.errors.length) {
          result.errors.forEach(error =>
            console.error(
              `> ${error.location.file}:${error.location.line}:${error.location.column}: error: ${error.text}`
            )
          )
        } else if (watch) console.log('[watch] build finished')
      })
    },
  }
}

module.exports = esbuildPluginProblemMatcher
