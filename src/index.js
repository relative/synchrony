#!/usr/bin/env node

const prettyMilliseconds = require('pretty-ms'),
  { performance } = require('perf_hooks'),
  escodegen = require('escodegen'),
  acorn = require('acorn'),
  chalk = require('chalk'),
  path = require('path'),
  fs = require('fs')

const Transformers = require('./transformers')

async function main(config, file) {
  config.transformers.forEach((cfgTransformer, index) => {
    let clazz = Transformers.find((tf) => tf.name === cfgTransformer.name)
    if (!clazz)
      throw new Error(`Transformer "${cfgTransformer.name}" does not exist`)
    config.transformers[index] = new clazz(cfgTransformer.params)
  })
  let inputPath = file,
    outputPath = file.slice(0, -2) + 'cleaned' + '.js'
  const input = fs.readFileSync(inputPath, 'utf8'),
    ast = acorn.parse(input, { ecmaVersion: 'latest' })

  await Promise.all(
    config.transformers.map(async (transformer, index) => {
      console.log(
        `(${chalk.magenta((index + 1).toString())}/${chalk.magenta(
          config.transformers.length
        )})`,
        'executing',
        chalk.yellow(transformer.name)
      )
      await transformer.run(ast, input)
    })
  )

  fs.writeFileSync(outputPath, escodegen.generate(ast), 'utf8')
  console.log('Wrote output to', outputPath)
}

require('yargs')
  .scriptName('synchrony')
  .usage('$0 <cmd> [args]')
  .command(
    ['deobfuscate <file>', '$0 <file>'],
    'Deobfuscates a file',
    (yargs) => {
      yargs
        .positional('file', {
          type: 'string',
          describe: 'File to deobfuscate (include .js extension)',
        })
        .option('config', {
          alias: ['c', 'cfg'],
          describe: 'Path to config file',
        })
        .demandOption(
          'config',
          'Please provide a path to a config file (you may make one using synchrony config <path>)'
        )
    },
    (args) => {
      let file = path.resolve(args.file)
      let now = performance.now()
      main(require(path.resolve(args.config)), file)
        .then(() => {
          let complete = performance.now()
          let time = complete - now
          console.log(`Deobfuscation complete in ${prettyMilliseconds(time)}`)
        })
        .catch((err) => {
          console.error('Deobfuscation failed', err)
        })
    }
  )
  .command(
    ['config <path>'],
    'Creates default configuration file',
    () => {},
    (args) => {
      let default_cfg = fs.readFileSync(
        path.resolve(__dirname, 'default_config.js'),
        'utf8'
      )
      let newPath = path.resolve(args.path)
      fs.writeFileSync(newPath, default_cfg, 'utf8')
      console.log('Wrote default config to', newPath)
    }
  ).argv
