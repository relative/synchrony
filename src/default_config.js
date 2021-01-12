module.exports = {
  transformers: [
    {
      name: 'SimplifyTransformer',
      params: {},
    },
    {
      name: 'StringDecoderTransformer',
      params: {
        identifiers: [['function', 0, func, 0]],
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
      name: 'ControlFlowTransformer',
      params: {},
    },
    {
      name: 'BufferCleanerTransformer',
      params: {},
    },
  ],
}
