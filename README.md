# synchrony

![rip javascript-obfuscator](/.github/hm.png)

javascript cleaner & deobfuscator (primarily [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)/[obfuscator.io](https://obfuscator.io))

## note

rewrite is a WIP, the below directions are invalid for now

## Usage

```shell
# 1. Install deobfuscator globally using yarn/npm
yarn global add deobfuscator # OR npm install --global deobfuscator
# 1.2. Or Install from Git
# yarn global add relative/synchrony#master # OR npm install --global relative/synchrony#master

# 2. Get an obfuscated file

# 3. Copy file to working directory

# 4. Create a config
synchrony config ./config.js

# 5. Run deobfuscator
synchrony deobfuscate ./script.js -c ./config.js

# 6. Check the reuslts of your debofuscation at script.cleaned.js
cat ./script.cleaned.js
```
