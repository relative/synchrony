const path = require('path'),
  fs = require('fs')

const transformers = []

const BASEDIR = __dirname

let dir = fs
  .readdirSync(BASEDIR)
  .filter((i) => i !== 'Transformer.js' && i !== 'index.js')

dir.forEach((ent) => {
  ent = path.join(BASEDIR, ent)
  transformers.push(require(ent))
})

module.exports = transformers
