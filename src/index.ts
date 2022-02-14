#!/usr/bin/env node
import yargs from 'yargs'
import path from 'path'
import fs from 'fs'
import { Deobfuscator } from './deobfuscator'

yargs.usage('$0 <cmd> [args]').command(
  ['deobfuscate <file>', '$0 <file>'],
  'Deobfuscate a file',
  (yargs) =>
    yargs.positional('file', {
      type: 'string',
      describe: 'File to deobfuscate (include extension)',
    }),
  (args) => {
    const abs = path.resolve(args.file!)
    fs.stat(abs, (err) => {
      if (err) return console.error('Failed to stat', err.code)
      fs.readFile(abs, 'utf8', (err, source) => {
        if (err) return console.error('Failed to read file', err.code)
        const deobfuscator = new Deobfuscator()
        deobfuscator.loadTransformers().then(() => {
          // ready
          deobfuscator.deobfuscateSource(source).then((source) => {
            fs.writeFile(abs + '.c.js', source, 'utf8', (err) => {
              if (err) return console.error('Failed to write file', err.code)
            })
          })
        })
      })
    })
  }
).argv
