const esbuild = require('esbuild'),
  { join } = require('path'),
  { copyFileSync } = require('fs')

const process_exit = process.exit

const ROOT_PATH = join(__dirname, '..'),
  DIST_PATH = join(ROOT_PATH, 'dist'),
  SRC_PATH = join(ROOT_PATH, 'src')

const args = process.argv.slice(2)

// should be 'production' | 'development'
const env = process.env.NODE_ENV ? process.env.NODE_ENV.trim() : 'development'

// --watch or -w
const watch = args.length > 0 && args[0].match(/^(?:--watch|-w)$/gi) !== null
if (watch) process.stdout.write('[watch] ')

// production enables certain things that make debugging harder
const production = env === 'production' || !watch

function emitTypes() {
  return new Promise((resolve, reject) => {
    // shh
    ;((argv, exit) => {
      // tsc will exit process on completion with process.exit
      process.exit = (code) => {
        process.exit = exit
        if (typeof code === 'number' && code > 0 /* unclean exit */)
          return reject(code)
        resolve()
      }

      // replace our argv to call the TSC cli from JS
      process.argv = ['node', 'tsc', '--emitDeclarationOnly', '--declaration']
      require('typescript/lib/tsc')

      // clean up after ourselves
      process.argv = argv
    })(process.argv, process_exit)
  })
}
function noop() {}
function postBuild() {
  console.log('Copying CLI ===')
  copyFileSync(join(SRC_PATH, 'cli.js'), join(DIST_PATH, 'cli.js'))

  console.log('Building type declarations ===')
  emitTypes()
    .then(() => {
      console.log('Type declarations built successfully')
    })
    .catch((code) => {
      console.error('tsc exited with code', code)
    })
}
console.log('Building lib ===')

// code splitting (+ shared code splitting) is only available for ESM format :(
esbuild
  .build({
    entryPoints: [join(SRC_PATH, 'index.ts')],

    watch: watch
      ? {
          onRebuild: (err) => {
            if (err && err.errors.length > 0)
              return console.error('Not running postBuild, esbuild failed')

            postBuild()
          },
        }
      : false,

    bundle: true,
    outdir: DIST_PATH,
    sourcemap: !production,
    minify: production,

    platform: 'node',
    format: 'cjs',

    legalComments: 'inline',

    // https://github.com/evanw/esbuild/issues/1975
    // once resolved, external should be ['./node_modules/*']
    external: Object.keys(require('../package.json').dependencies),

    logLevel: 'info',
    logLimit: process.env.CI ? 0 : 30,
  })
  .then(() => postBuild())
  .catch((_err) => {
    process_exit(1)
  })
