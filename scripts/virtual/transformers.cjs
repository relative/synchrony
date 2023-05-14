const { default: generate } = require('@babel/generator'),
  { default: template } = require('@babel/template'),
  t = require('@babel/types'),
  glob = require('glob'),
  path = require('path')

const srcTransformersDir = path.join(__dirname, '..', '..', 'src', 'transformers')

const tplProgram = template.program('%%imports%%', { plugins: ['typescript'] })

module.exports = () => {
  const files = glob.sync('**/*.ts', {
    cwd: srcTransformersDir,
    ignore: ['index.ts'],
  })

  const program = tplProgram({
    imports: files.map(i => t.importDeclaration([], t.stringLiteral('~/transformers/' + i))),
  })
  return generate(program).code
}
