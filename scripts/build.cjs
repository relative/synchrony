const esbuild = require('esbuild'),
  { readdirSync } = require('fs'),
  { join } = require('path')

const esbuildPluginProblemMatcher = require('./esbuild-plugin-problem-matcher.cjs'),
  esbuildPluginGenerator = require('./esbuild-plugin-generator.cjs'),
  esbuildPluginCopyFiles = require('./esbuild-plugin-copyfiles.cjs'),
  esbuildPluginTsc = require('./esbuild-plugin-tsc.cjs')

const ROOT_PATH = join(__dirname, '..'),
  DIST_PATH = join(ROOT_PATH, 'dist'),
  SRC_PATH = join(ROOT_PATH, 'src')

const args = process.argv.slice(2)

// --watch or -w
const watch = args.length > 0 && args.some(arg => arg.match(/^(?:--watch|-w)$/gi) !== null)
if (watch) console.log('Building in watch mode')

// production enables certain things that make debugging harder
const production = args.length > 0 && args.some(arg => arg.match(/^(?:--prod|--production|-p)$/gi) !== null)

async function main() {
  console.log(`Building lib ${production ? 'in production ' : ''}===`)

  const virtualModuleDir = join(__dirname, 'virtual')

  const ctx = await esbuild.context({
    entryPoints: [join(SRC_PATH, 'index.ts')],

    bundle: true,
    outdir: DIST_PATH,
    sourcemap: true,
    minify: production,

    external: [...Object.keys(require('../package.json').dependencies)],

    // This doesn't work with tsconfig path aliases lol
    // https://github.com/evanw/esbuild/issues/2792#issuecomment-1371360458
    // packages: 'external',

    platform: 'node',
    format: 'cjs',

    legalComments: 'inline',

    logLevel: 'info',
    logLimit: process.env.CI ? 0 : 30,

    plugins: [
      esbuildPluginGenerator({
        modules: Object.fromEntries(
          readdirSync(virtualModuleDir).map(i => {
            return [i.split('.')[0], require(join(virtualModuleDir, i))]
          })
        ),
      }),
      esbuildPluginCopyFiles({
        files: [join(SRC_PATH, 'cli.js')],
        outdir: DIST_PATH,
      }),
      esbuildPluginTsc(),

      esbuildPluginProblemMatcher(watch),
    ],
  })

  if (watch) {
    await ctx.watch()
  } else {
    await ctx.rebuild()
    await ctx.dispose()
  }
}

main()
