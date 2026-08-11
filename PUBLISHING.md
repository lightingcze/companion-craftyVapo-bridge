# Publishing Guide

This module is packaged as an official-submission candidate. The only value
that must be supplied outside this workspace is the final public GitHub
repository URL.

## 1. Create The Public Repository

Create a public repository for the Companion module source, for example:

```text
https://github.com/<github-owner>/companion-module-crafty-bridge
```

Use the contents of `companion-module-crafty-bridge-0.1.17-source.zip` as the
initial repository source.

You can also generate a clean staging folder directly:

```powershell
npm run repo:stage -- <github-owner>/companion-module-crafty-bridge
```

The source package includes:

- GitHub Actions CI
- pull request template
- bug report issue template
- release audit scripts

## 2. Set Manifest URLs

From the module source folder:

```powershell
npm run repo:set -- <github-owner>/companion-module-crafty-bridge
```

or:

```powershell
npm run repo:set -- https://github.com/<github-owner>/companion-module-crafty-bridge
```

This updates:

- `companion/manifest.json` `repository`
- `companion/manifest.json` `bugs`

## 3. Verify Strict Official Gate

```powershell
npm run lint
npm run release:audit:strict
npm run package
```

The strict audit should pass only after the real repository and issues URLs are
set.

## 4. Build Runtime Package

```powershell
npx companion-module-build
npm run release:manifest
npm run release:handoff
```

Expected output:

```text
crafty-bridge-0.1.17.tgz
```

The root workspace release helper also writes:

```text
RELEASE_MANIFEST.json
SHA256SUMS.txt
release-handoff-0.1.17
```

## 5. Submit

Use the public repository source for the Bitfocus Companion module submission.
The `.tgz` package is useful for local testing and validation before submission.
