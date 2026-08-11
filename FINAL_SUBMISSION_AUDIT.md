# Final Submission Audit

Version: 0.1.17

## Objective

Prepare a package suitable for moving toward official Bitfocus Companion plugin
submission.

## Proven Complete

- Companion runtime package builds successfully.
- Runtime package imports as a Companion module archive.
- Source package is clean and excludes generated folders such as `node_modules`,
  `.npm-cache`, `pkg`, and historical `.tgz` builds.
- Module uses Companion runtime `node22` and API `nodejs-ipc` `2.0.4`.
- Runtime permissions are explicitly disabled for:
  - child processes
  - filesystem
  - native addons
  - worker threads
  - insecure algorithms
- Module source does not start or stop local shell processes.
- Module communicates with Crafty Bridge over HTTP.
- Ready-made presets, variables, actions, feedbacks, BLE device selection, and
  capsule tracking remain in the module.
- MIT license, README, Companion HELP, publishing guide, CI workflow, PR
  template, issue template, release audit, and handoff tooling are present.
- Runtime and source artifacts have SHA256 checksums.

## Verified Commands

```powershell
npm run lint
npm run release:audit
node ..\test\smoke.js
npx companion-module-build
npm run release:manifest
npm run release:handoff
```

## Generated Release Files

- `companion-module-crafty-bridge-0.1.17-official-rc.tgz`
- `companion-module-crafty-bridge-0.1.17-source.zip`
- `crafty-bridge-0.1.17-handoff.zip`
- `RELEASE_MANIFEST.json`
- `SHA256SUMS.txt`
- `release-handoff-0.1.17`
- `public-repo-staging-0.1.17`

## Remaining External Gate

The final public submission is intentionally not marked complete until a real
public GitHub repository exists.

Required final commands after creating the public repository:

```powershell
npm run repo:set -- <github-owner>/companion-module-crafty-bridge
npm run release:audit:strict
npm run package
```

The strict audit should fail before the real repository URL is set and pass
afterward.
