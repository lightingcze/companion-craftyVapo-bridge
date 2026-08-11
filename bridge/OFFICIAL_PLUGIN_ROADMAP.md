# Official Companion Plugin Roadmap

Goal: make the module usable by anyone after download/install, then prepare it for official Companion distribution.

## Current State

The project currently has two parts:

- Windows BLE bridge: talks to Crafty over Bluetooth LE.
- Companion module: talks to the bridge over local HTTP.

This split is intentional because Companion modules run inside Companion and direct BLE support can be difficult across platforms.

## Before Public Release

Required:

- Confirm installation on a clean Windows machine.
- Confirm Node.js LTS version support.
- Add screenshots to documentation.
- Add license file.
- Add CI checks for `node --check` and smoke tests.
- Add release archive with bridge and module package.
- Make bridge install/start process easier for non-technical users.

Recommended:

- Windows tray helper or service installer.
- Signed executable or packaged `.exe`.
- Companion module config field for bridge URL and poll interval.
- Safer developer mode toggle for raw BLE read/write endpoints.
- More device compatibility testing: Crafty, Crafty+, Venty, Volcano if available.

## Official Plugin Submission Shape

For official Companion usage, the module should live in its own repository with:

```text
companion/manifest.json
src/main.js
package.json
README.md
HELP.md
LICENSE
```

The bridge can be:

- a separate downloadable helper app, or
- a companion package documented as required external service.

## Release Checklist

1. Update version in all package/manifest files.
2. Run:

```powershell
npm test
node --check src/server.js
node --check src/craftyBle.js
node --check companion-module-crafty-bridge/src/main.js
```

3. Build module:

```powershell
cd companion-module-crafty-bridge
npx companion-module-build --dev --output companion-module-crafty-bridge-VERSION-build
```

4. Test import into Companion.
5. Test on Stream Deck XL.
6. Export example Companion config.
7. Tag release.

## Known Limitations

- Capsule tracking is an estimate.
- Bluetooth behavior can vary by Windows adapter/driver.
- Some Crafty characteristics are exposed but not fully documented.
- Raw write endpoint is for development and should be hidden or disabled for public release.
