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
      yargs.positional('file', {
        type: 'string',
        describe: 'File to deobfuscate (include extension)',
      }),
    (args) => {
      const abs = path.resolve(args.file)
      fs.stat(abs, (err) => {
        if (err) return console.error('Failed to stat', err.code)
        fs.readFile(abs, 'utf8', (err, source) => {
          if (err) return console.error('Failed to read file', err.code)
          const deobfuscator = new Deobfuscator()
          // ready
          deobfuscator.deobfuscateSource(source).then((source) => {
            let ext = path.extname(abs)
            let newFilename =
              abs.substring(0, abs.length - ext.length) + '.cleaned' + ext
            fs.writeFile(newFilename, source, 'utf8', (err) => {
              if (err) return console.error('Failed to write file', err.code)
            })
          })
        })
      })
    }
  ).argv
