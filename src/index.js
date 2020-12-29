const escodegen = require('escodegen'),
  acorn = require('acorn'),
  chalk = require('chalk'),
  fs = require('fs')

const Transformers = require('./transformers')

const Config = {
  transformers: [
    {
      name: 'SimplifyTransformer',
      params: {},
    },
  ],
}

Config.transformers.forEach((cfgTransformer, index) => {
  let clazz = Transformers.find((tf) => tf.name === cfgTransformer.name)
  if (!clazz)
    throw new Error(`Transformer "${cfgTransformer.name}" does not exist`)
  Config.transformers[index] = new clazz(cfgTransformer.params)
})

async function main() {
  const input = fs.readFileSync('./test.js', 'utf8'),
    ast = acorn.parse(input, { ecmaVersion: 'latest' })

  await Promise.all(
    Config.transformers.map(async (transformer, index) => {
      console.log(
        `(${chalk.magenta((index + 1).toString())}/${chalk.magenta(
          Config.transformers.length
        )})`,
        'executing',
        chalk.yellow(transformer.name)
      )
      await transformer.run(ast, input)
    })
  )

  fs.writeFileSync('./test.cleaned.js', escodegen.generate(ast), 'utf8')
}

main()
