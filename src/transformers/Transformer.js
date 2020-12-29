const chalk = require('chalk')

module.exports = class Transformer {
  constructor(name, color, params) {
    this.name = name
    this.color = color
    this.params = params
  }

  log(...args) {
    console.log(`(${chalk[this.color](this.name)})`, ...args)
  }

  async run(ast) {
    throw new Error(`${this.name}#run not implemented!`)
    return ast
  }
}
