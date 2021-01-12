const escodegen = require('escodegen'),
  acorn = require('acorn'),
  chalk = require('chalk'),
  fs = require('fs')

const Transformers = require('./transformers')

var _0x296b = [
  'GetEyePosition',
  'start_tick',
  'FilledCircle',
  '2749NmRNap',
  'GetScreenSize',
  '519870YpTGjx',
  'v_helper_data.js',
  '_nsl',
  'Test nade',
  'AddHotkey',
  'RegisterCallback',
  'AddColorPicker',
  'GetValue',
  '34PyGtgy',
  'Icon color',
  ' [Temporary]',
  'GetInt',
  'ExecuteCommand',
  'Line',
  'SUBTAB_MGR',
  'closest',
  'running',
  'AddDropdown',
  'atan2',
  'Runright',
  'SetMovement',
  'sin',
  'Run Jumpthrow',
  'GetEntityFromUserID',
  'Back to nade',
  'on_local_connect',
  '_ht',
  'm_vecViewOffset[2]',
  '", ',
  '644419yFYwzd',
  'Bind',
  'SetButtons',
  'ignore_input',
  'next_tick_ang',
  'GetRenderOrigin',
  'Print nade',
  'Silent',
  'pitch',
  'Qursse1337',
  'DarkkLight',
  'indexOf',
  'setpos ',
  'Half throw',
  'GetServerString',
  'smallest_pixel-7.ttf',
  'abs',
  '_bs',
  'WorldToScreen',
  'GetString',
  'Back',
  'push',
  'Throw',
  'AddSliderFloat',
  'Run BackJumpthrow',
  'skillb1szt',
  'check_visibility',
  'Show all map',
  'Fhosen',
  'Throw type',
  'undefeated.ttf',
  'GetCameraAngles',
  'molotov',
  'FilledRect',
  'FOV',
  'IsLocalPlayer',
  'Config',
  'GetMapName',
  'bullet (1).ttf',
  'GetProp',
  'Run RightForwardJumpthrow',
  'Run HalfJumpthrow',
  'Helper',
  'NORMAL',
  'verdana.ttf',
  ', "',
  'GetWeapon',
  'SetViewAngles',
  'Run LeftJumpthrow',
  '_night_old',
  'on_grenade',
  'Run LeftForwardJumpthrow',
  'Run RightJumpthrow',
  'Scripts',
  'Runleft',
  'Move back duration',
  '17164YnNVBG',
  'smoke grenade',
  'run_start',
  'RunJump speed [Left right]',
  'Delay',
  '697cTzyWL',
  'SetValue',
  'filter',
  'draw',
  '_ss',
  'GetButtons',
  '], "',
  'animate_alpha',
  'Draw',
  'Text color',
  'player_connect_full',
  'toLowerCase',
  '_kg',
  'Jumpthrow',
  'length',
  'moved_base',
  'weapon_wallbang',
  'SHEET_MGR',
  '_scrimmagemap',
  'high explosive grenade',
  'Location adder',
  'yaw',
  'Keys',
  'started_throwing',
  'delay',
  '", [',
  'GetLocalPlayer',
  'draw_temp_nade',
  'Tickcount',
  '4UezRma',
  'attacked',
  'TextSize',
  'quit',
  'sqrt',
  'FadedCircle',
  'Render custom locations',
  'AddTextbox',
  '","',
  'calibrib.ttf',
  'CreateMove',
  'Half Jumpthrow',
  'userid',
  'Set as current',
  '_bc',
  'AddCheckbox',
  'Name',
  'Visuals',
  'Print',
  'm_vecOrigin',
  'GetViewAngles',
  'AddSliderInt',
  '171205lafpEl',
  'cos',
  'Run duration',
  '_night',
  'Pixel string',
  'flashbang',
  'Set',
  'CBasePlayer',
  'SantIkcc',
  'DT_CSPlayer',
  'Runthrow',
  'GetName',
  '26394VkZayz',
  'JS Keybinds',
  '_fps',
  'setang ',
  'CTRL',
  '1258sVBYbj',
  'AddFont',
  'incendiary grenade',
  'move_on_key',
  '_rt',
  'String',
]
var _0x2e2a = function (_0x1f8261, _0x2941d3) {
  _0x1f8261 = _0x1f8261 - 0xa4
  var _0x296bdc = _0x296b[_0x1f8261]
  return _0x296bdc
}
var _0x19c7f6 = _0x2e2a
;(function (_0x27b453, _0x144a91) {
  var _0x4618c5 = _0x2e2a
  while (!![]) {
    try {
      var _0x47458c =
        parseInt(_0x4618c5(0xb2)) +
        parseInt(_0x4618c5(0xa6)) +
        -parseInt(_0x4618c5(0xc2)) +
        -parseInt(_0x4618c5(0xdf)) +
        parseInt(_0x4618c5(0xc0)) * -parseInt(_0x4618c5(0x139)) +
        parseInt(_0x4618c5(0x117)) * parseInt(_0x4618c5(0xca)) +
        -parseInt(_0x4618c5(0x11c)) * -parseInt(_0x4618c5(0xb7))
      if (_0x47458c === _0x144a91) break
      else _0x27b453['push'](_0x27b453['shift']())
    } catch (_0x2ee20f) {
      _0x27b453['push'](_0x27b453['shift']())
    }
  }
})(_0x296b, 0x75d9c)

const Config = {
  transformers: [
    {
      name: 'SimplifyTransformer',
      params: {},
    },
    {
      name: 'StringDecoderTransformer',
      params: {
        identifiers: [['_0x19c7f6', 0, _0x2e2a, 2]], // TYPE_THREE
      },
    },
    {
      name: 'SimplifyTransformer',
      params: {},
    },
    {
      name: 'BufferCleanerTransformer',
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
