const Transformer = require('./Transformer'),
  walk = require('acorn-walk')

const { unaryExpressionToNumber } = require('../util/Translator'),
  math = require('../util/Math')

module.exports = class SimplifyTransformer extends (
  Transformer
) {
  constructor(params) {
    super('SimplifyTransformer', 'blue', params)
  }

  async run(ast) {
    const log = this.log.bind(this)
    // Simplify string-concatentation
    walk.simple(ast, {
      BinaryExpression(node) {
        // string concatenation
        if (
          node.left.type === 'Literal' &&
          node.right.type === 'Literal' &&
          typeof node.left.value === 'string' &&
          typeof node.right.value === 'string'
        ) {
          node.type = 'Literal'
          node.value = node.left.value + node.right.value
          log(
            'Combined BinaryExpression ->',
            node.left.value,
            '+',
            node.right.value
          )
        }

        // Converts UnaryExpressions to numeric literals
        if (
          node.left.type === 'UnaryExpression' &&
          typeof node.left.argument.value === 'number'
        ) {
          node.left.type = 'Literal'
          node.left.value = unaryExpressionToNumber(node.left)
          delete node.left.operator
          delete node.left.prefix
        }
        if (
          node.right.type === 'UnaryExpression' &&
          typeof node.right.argument.value === 'number'
        ) {
          node.right.type = 'Literal'
          node.right.value = unaryExpressionToNumber(node.right)
          delete node.right.operator
          delete node.right.prefix
        }

        // Combines numeric Literals
        if (
          node.left.type === 'Literal' &&
          node.right.type === 'Literal' &&
          typeof node.left.value === 'number' &&
          typeof node.right.value === 'number'
        ) {
          let val = math(node.left.value, node.operator, node.right.value)
          node.type = 'Literal'
          node.value = val
          log(
            'Combined BinaryExpression ->',
            node.left.value,
            node.operator,
            node.right.value
          )
        }
      },
    })

    // Simplify double-negative NumericLiterals
    walk.simple(ast, {
      Literal(node) {
        if (typeof node.value === 'number' && node.value < 0) {
          node.type = 'UnaryExpression'
          node.operator = '-'
          node.prefix = true
          node.argument = {
            type: 'Literal',
            value: Math.abs(node.value),
          }
        }
      },
    })

    return ast
  }
}
