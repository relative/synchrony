# synchrony

javascript cleaner & deobfuscator (primarily [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)/[obfuscator.io](https://obfuscator.io))

## Usage

```shell
# 1. Install deobfuscator globally using yarn/npm
yarn global add deobfuscator # OR npm install --global deobfuscator
# 1.2. Or Install from Git
# yarn global add uwu/synchrony#master # OR npm install --global uwu/synchrony#master

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

## StringArrayTransformer notes

Converts from

```js
t[_oo0[1]][_oo0[27]] = function () {
  var _oQo = [
    0,
    '\x64\x6f\x63\x75\x6d\x65\x6e\x74\x4c\x69\x73\x74',
    '\x5f\x5f\x61\x77\x61\x69\x74\x65\x72',
  ]
  var _sZz2sZS2 = _oQo[1]
  return k[_oQo[2]](this, void _oQo[0], void _oQo[0], function () {
    var _zz = ['x', '\x5f\x5f\x67\x65\x6e\x65\x72\x61\x74\x6f\x72', 36067]
    var e
    var _00OO0QQo = _zz[2],
      _SSZ$z2$s = _zz[0]
    return k[_zz[1]](this, function (t) {
      var _l1I = [
        4,
        '\x6c\x61\x62\x65\x6c',
        '\x69\x6e\x70\x75\x74',
        '\x62\x43\x6f\x6c\x6c\x65\x63\x74\x6f\x72\x45\x6e\x63\x72\x79\x70\x74',
        '\x73\x65\x6e\x74',
        '\x76\x61\x6c\x75\x65',
        2,
        '\x63\x6f\x6c\x6c\x65\x63\x74',
        1,
        '\x62\x44\x6f\x6d',
        0,
      ]
      var _22S$S22s = _l1I[3],
        _O0QoooOo = _l1I[9]
      switch (t[_l1I[1]]) {
        case _l1I[10]:
          return [_l1I[0], this[_l1I[7]]()]
        case _l1I[8]:
          return (e = t[_l1I[4]]()), (this[_l1I[2]][_l1I[5]] = e), [_l1I[6]]
      }
    })
  })
}
```

to

```js
t.prototype['report'] = function () {
  var _oQo = [0, 'documentList', '__awaiter']
  var _sZz2sZS2 = 'documentList'
  return k['__awaiter'](this, void 0, void 0, function () {
    var _zz = ['x', '__generator', 36067]
    var e
    var _00OO0QQo = 36067,
      _SSZ$z2$s = 'x'
    return k['__generator'](this, function (t) {
      var _l1I = [
        4,
        'label',
        'input',
        'bCollectorEncrypt',
        'sent',
        'value',
        2,
        'collect',
        1,
        'bDom',
        0,
      ]
      var _22S$S22s = 'bCollectorEncrypt',
        _O0QoooOo = 'bDom'
      switch (t.label) {
        case 0:
          return [4, this['collect']()]
        case 1:
          return (e = t.sent()), (this['input']['value'] = e), [2]
      }
    })
  })
}
```

Example config

```js
module.exports = {
  transformers: [
    {
      name: 'SimplifyTransformer',
      params: {},
    },
    {
      name: 'StringArrayTransformer',
      params: {
        findIdentifiers: true, // finds arrays for you
        findIdentifiers_onlyEscapeSeqsOnStr: true, // Only finds arrs with
        // escape seq strs or \n s
        // (see above)
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
```
