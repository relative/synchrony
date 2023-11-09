#!/usr/bin/env node
const { Deobfuscator } = require('../'),
  yargs = require('yargs'),
  path = require('path'),
  fs = require('fs')

yargs
  .scriptName('synchrony')
  .usage('Usage: $0 <command> [args]')
  .command(
    ['deobfuscate <file>', '$0 <file>'],
    'Deobfuscate a file',
    (yargs) =>
      yargs
        .positional('file', {
          type: 'string',
          describe: 'File to deobfuscate (include extension)',
        })
        .option('rename', {
          type: 'boolean',
          default: false,
          description: 'Rename symbols automatically',
        })
        .option('ecma-version', {
          alias: ['esversion', 'es'],
          default: 'latest',
          type: 'string',
          description: 'Set ECMA version for AST parser (see acorn docs)',
        })
        .option('config', {
          alias: 'c',
          type: 'string',
          description: 'Supply a custom deobfuscation config (see docs)',
        })
        .option('output', {
          alias: 'o',
          type: 'string',
          description: 'Where to output deobfuscated file',
        })
        .option('loose', {
          alias: 'l',
          type: 'boolean',
          default: false,
          description: 'Enable loose parsing',
        })
        .option('sourceType', {
          alias: 'type',
          type: 'string',
          default: 'both',
          description: "Source type for file ('script', 'module', or 'both')",
        }),
    (args) => {
      const abs = path.resolve(args.file)
      fs.stat(abs, (err) => {
        if (err) return console.error('Failed to stat', err.code)
        fs.readFile(abs, 'utf8', (err, source) => {
          if (err) return console.error('Failed to read file', err.code)
          const deobfuscator = new Deobfuscator()
          let opts = {
            rename: args.rename,
            ecmaVersion: args.ecmaVersion,
            output: args.output,
            loose: args.loose,
            sourceType: args.sourceType,
          }

          if (args.config) {
            let configPath = path.resolve(args.config)
            if (!fs.existsSync(configPath)) {
              console.error(
                'Configuration file',
                '"' + args.config + '"',
                'does not exist on disk'
              )
              process.exit(1)
            }
            Object.assign(opts, require(configPath))
            console.log('Loaded config from', '"' + args.config + '"')
          }

          // ready
          deobfuscator.deobfuscateSource(source, opts).then((source) => {
            let ext = path.extname(abs)
            let newFilename = opts.output
              ? opts.output
              : abs.substring(0, abs.length - ext.length) + '.cleaned' + ext
            fs.writeFile(newFilename, source, 'utf8', (err) => {
              if (err) return console.error('Failed to write file', err.code)
            })
          })
        })
      })
    }
  ).argv
