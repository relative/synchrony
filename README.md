# synchrony

javascript cleaner & deobfuscator (primarily [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)/[obfuscator.io](https://obfuscator.io))

## Usage

```shell
# 1. Install deobfuscator globally using yarn/npm
yarn global add deobfuscator # OR npm install --global deobfuscator

# 2. Get an obfuscated file

# 3. Copy file to working directory

# 4. Create a config
synchrony config ./config.js

# 5. Run deobfuscator
synchrony deobfuscate ./script.js -c ./config.js

# 6. Check the reuslts of your debofuscation at script.cleaned.js
cat ./script.cleaned.js
```

## StringDecoderTransformer notes

You must insert the string array, shift function and decoding function to the beginning of your config and add it as an identifier in the StringDecoderTransformer params like so:

```js
// String array!!
var _0x262d = [
  'Hello\x20World!',
  '1065485QnEExh',
  '673119eqnRkZ',
  '289KvrWZb',
  '205XOIgxB',
  '2599iaVSlX',
  '79UTBsLw',
  '24397klLRMv',
  'log',
  '160370DvZjfY',
  '8322uOqLzX',
  '30TotMll',
]

// Decoding function!!
var _0x1567 = function (_0x826813, _0x4c9e65) {
  _0x826813 = _0x826813 - 0x104
  var _0x262dbd = _0x262d[_0x826813]
  return _0x262dbd
}

// Shift function!!
;(function (_0x3d6247, _0x2d281d) {
  while (!![]) {
    try {
      var _0x44d9da =
        -parseInt(_0x1567(0x109)) +
        -parseInt(_0x1567(0x10e)) +
        -parseInt(_0x1567(0x10f)) * parseInt(_0x1567(0x106)) +
        parseInt(_0x1567(0x10b)) * -parseInt(_0x1567(0x10a)) +
        parseInt(_0x1567(0x104)) * parseInt(_0x1567(0x105)) +
        -parseInt(_0x1567(0x107)) +
        parseInt(_0x1567(0x10d))
      if (_0x44d9da === _0x2d281d) {
        break
      } else {
        _0x3d6247['push'](_0x3d6247['shift']())
      }
    } catch (_0x15fa38) {
      _0x3d6247['push'](_0x3d6247['shift']())
    }
  }
})(_0x262d, 0x723bf)

module.exports = {
  transformers: [
    {
      name: 'SimplifyTransformer',
      params: {},
    },
    {
      name: 'StringDecoderTransformer',
      params: {
        identifiers: [['_0x1567', 0, _0x1567, 0]],
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
```
