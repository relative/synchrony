module.exports = {
  transformers: [
    {
      name: 'SimplifyTransformer',
      params: {},
    },
    {
      name: 'StringDecoderTransformer',
      params: {
        identifiers: [['function', 0, func, 0, [0, 1]]],
        findStringArrays: true,
      },
    },
    {
      name: 'LiteralMapTransformer',
      params: {},
    },
    {
      name: 'SimplifyTransformer',
      params: {},
    },
    {
      name: 'MemberExpressionCleanerTransformer',
      params: {},
    },
    {
      name: 'BufferCleanerTransformer',
      params: {},
    },
  ],
}
