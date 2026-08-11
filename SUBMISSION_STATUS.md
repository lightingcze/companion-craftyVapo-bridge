# Crafty Bridge Companion Module Submission Status

Version: 0.1.17

## Package Status

This module is ready as a local Companion import and official-submission release
candidate.

The runtime package is intentionally sandbox-friendly:

- no child process permission
- no filesystem permission
- no native addon permission
- no worker thread permission
- no insecure algorithm permission
- HTTP-only communication with the external Crafty Bridge service

## Generated Artifacts

- `crafty-bridge-0.1.17.tgz`: Companion module runtime package.
- `companion-module-crafty-bridge-0.1.17-official-rc.tgz`: named copy for local import/testing.
- `companion-module-crafty-bridge-0.1.17-source.zip`: source package for creating the public repository.
- `RELEASE_MANIFEST.json`: release metadata and artifact SHA256 hashes.
- `SHA256SUMS.txt`: compact checksum list for release artifacts.
- `release-handoff-0.1.17`: verified handoff folder containing artifacts and checksums.

## Repository Support Files

- GitHub Actions CI for lint, release audit, and package build.
- Pull request template with Companion/device verification checklist.
- Bug report issue template for Companion, bridge, Windows, and BLE details.

## Verification Commands

```powershell
npm run lint
npm run release:audit
node ..\test\smoke.js
npx companion-module-build
npm run release:manifest
npm run release:handoff
```

## Repository URL Helper

The current public GitHub repository is:

```text
https://github.com/lightingcze/companion-craftyVapo-bridge
```

To retarget the module to another public repository later, run:

```powershell
npm run repo:set -- <github-owner>/<repo-name>
```

Or create a clean public-repo staging folder in one step:

```powershell
npm run repo:stage -- <github-owner>/<repo-name>
```

## Public Submission Gate

`npm run release:audit:strict` must pass before publishing, tagging, or using
the source repository for a Bitfocus Companion submission.
