enum Values {
  Undefined = 0,
  False = 1,
  True = 2,
}
function getValue(v?: string, def = Values.Undefined): Values {
  if (!v) return def
  v = v.trim()
  if (v === '0' || v.startsWith('f' /* alse */)) return Values.False
  if (v === '1' || v.startsWith('t' /* rue */)) return Values.True
  return def
}

function getRealColorEnabled(): boolean {
  if (getValue(process.env.NO_COLOR) === Values.True) return false
  switch (getValue(process.env.FORCE_COLOR)) {
    case Values.True:
      return true
    case Values.False:
      return false
  }
  return true
}

export let colorEnabled = (): boolean => {
  // todo: should do this at startup rather than a cached function
  const enabled = getRealColorEnabled()

  return (
    (colorEnabled = () => {
      return enabled
    }),
    enabled
  )
}
