# synchrony

![rip javascript-obfuscator](/.github/hm.png)

javascript cleaner & deobfuscator (primarily [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)/[obfuscator.io](https://obfuscator.io))

API reference is available at <https://relative.github.io/synchrony>

## Usage note

Artifacts produced by old versions of javascript-obfuscator will likely not deobfuscate correctly, please **DO NOT** open an issue. Try previous versions of synchrony or another deobfuscator.

There is no user configuration as of yet, the string decoder works automatically

## Usage

Use the latest version at <https://deobfuscate.relative.im> or install from NPM

```shell
# 1. Install deobfuscator globally using yarn/npm
npm install --global deobfuscator # alternatively, yarn global add deobfuscator, pnpm install --global deobfuscator

# 1.1. Or Install from Git
# npm install --global relative/synchrony#master # alternatively, yarn global add relative/synchrony#master, pnpm install --global relative/synchrony#master

# 2. Get an obfuscated file
curl https://gist.github.com/relative/79e392bced4b9bed8fd076f834e06dee/raw/obfuscated.js -o ./obfuscated.js

# 3. Run deobfuscator
synchrony deobfuscate ./obfuscated.js

# 4. Check the reuslts of your debofuscation at script.cleaned.js
cat ./obfuscated.cleaned.js
```

## Transformer errors

Transformer errors will show errors in your terminal output like

```
Caught an error while attempting to run AST visitor!
node = Node {...}
err = ...
```

Copy the entire terminal output (or redirect it to a file). Then open a new issue with the terminal output and the
obfuscated file and any config you may have used.

**Please do not include screenshots or partial output from the deobfuscator.**

If you can reproduce the error with a smaller input file and a javascript-obfuscator config, please provide them in your issue.
