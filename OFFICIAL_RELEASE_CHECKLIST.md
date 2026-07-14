# Official Companion Release Checklist

Status: release-candidate package for local testing and official submission prep.

## Completed

- Module uses Companion API v2 through `@companion-module/base`.
- Runtime target is Node 22.
- Module no longer imports `node:child_process`.
- Module no longer starts, stops, or restarts local shell processes.
- Hardcoded development PC paths were removed from Companion connection settings.
- MIT license file is included in the module source and package.
- `npm run release:audit` checks the main official-readiness invariants.
- `npm run release:audit:strict` is available for final public-submission gating.
- Runtime permissions explicitly disable child process, filesystem, native addons, worker threads, and insecure algorithms.
- `npm run repo:set -- <owner>/<repo>` updates final public repository URLs.
- `npm run repo:stage -- <owner>/<repo>` creates a clean public-repo staging folder.
- Source package includes GitHub Actions CI, PR template, and bug report template.
- `npm run release:manifest` writes release checksums for generated artifacts.
- `npm run release:handoff` creates the verified handoff folder.
- Bridge operation is done through HTTP endpoints only.
- Presets are provided for dashboard, control, temperature, boost, pairing, and capsule tracking.
- Documentation explains the split between the Companion module and the separate Crafty Bridge service.

## Before Public Submission

- Confirm `companion/manifest.json` points to the final public repository and issue tracker.
- Confirm final maintainer name, GitHub handle, and optional contact email.
- Publish the source repository without generated folders such as `node_modules`, `.npm-cache`, `pkg`, and old `.tgz` builds.
- Confirm the bridge service install story for non-developer users.
- Test on a clean Windows machine with Companion v5 and a real Crafty/Crafty+ device.

## Build Commands

```powershell
cd companion-module-crafty-bridge
npm run repo:set -- lightingcze/companion-craftyVapo-bridge
npm run lint
npm run release:audit
npm run release:audit:strict
npx companion-module-build
npm run release:manifest
npm run release:handoff
```

`release:audit:strict` should pass before publishing or submitting the module.

The generated `.tgz` can be imported into Companion for local module testing.
