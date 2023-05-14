# synchrony

![rip javascript-obfuscator](/.github/hm.png)

javascript cleaner & deobfuscator (primarily [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)/[obfuscator.io](https://obfuscator.io))

API reference is available at <https://relative.github.io/synchrony>

## Usage note

Artifacts produced by old versions of javascript-obfuscator will likely not deobfuscate correctly, please **DO NOT** open an issue. Try previous versions of synchrony or another deobfuscator.

## Usage

Use the latest version at <https://deobfuscate.relative.im> or install from NPM

```shell
# 1. Install deobfuscator globally using yarn/npm
npm install --global deobfuscator # alternatively, yarn global add deobfuscator, pnpm install --global deobfuscator

# 2. Get an obfuscated file
curl https://gist.github.com/relative/79e392bced4b9bed8fd076f834e06dee/raw/obfuscated.js -o ./obfuscated.js

# 3. Run deobfuscator
synchrony deobfuscate ./obfuscated.js

# 4. Check the results of your debofuscation at script.cleaned.js
cat ./obfuscated.cleaned.js
```

## Building/Contributing

Dependencies

1. git
2. node.js >=v16.17
3. pnpm (`corepack prepare pnpm@latest --activate`)

```shell
git clone https://github.com/relative/synchrony.git synchrony
cd synchrony
pnpm install
pnpm build # cache generated files for IDE autocomplete
# make your changes...
pnpm lint # lint your changes
pnpm build

# to use the CLI
pnpm link --global
# It should now be available as `synchrony` in your shell
synchrony --version
```
