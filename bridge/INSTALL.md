# Install Guide

## Requirements

- Windows 10/11
- Bluetooth LE adapter supported by Windows
- Node.js 22 LTS or newer
- Bitfocus Companion v5
- Stream Deck XL or Companion Web Buttons

## Bridge Install

### Recommended Windows installation

For another Windows PC, use `crafty-bridge-windows-0.1.17.zip`:

1. Extract the complete ZIP file.
2. Double-click `INSTALL.cmd`.
3. Wait for the health check to pass.
4. Import the `.tgz` file included in the ZIP into Companion.

The installer works without administrator rights or internet access. It installs
into `%LOCALAPPDATA%\CraftyBridge`, verifies its bundled official portable
Node.js 22 runtime and BLE dependencies, starts the bridge, and creates automatic
startup for the current Windows user.

The Companion module itself cannot install or start Windows processes because
official Companion modules run in a restricted sandbox. The Windows ZIP is the
end-user deployment package that installs both required parts.

### Developer installation

```powershell
cd "C:\Users\ondra\Documents\crafty iphone"
npm install
npm start
```

Bridge URL:

```text
http://127.0.0.1:4587
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:4587/health
```

Stop bridge:

```powershell
npm run stop
```

## Companion Module Install

Use the module package included in the Windows installer ZIP, or this standalone
release file:

```text
companion-module-crafty-bridge-0.1.17-official-rc.tgz
```

In Companion:

1. Open `Settings` or `Modules`.
2. Install/import the `.tgz` module.
3. Restart Companion if needed.
4. Add connection `Crafty Bridge`.
5. Set bridge URL to `http://127.0.0.1:4587`.
6. Enable the connection.

## Automatic Bridge Startup

The Windows installer creates a per-user startup shortcut. The bridge starts
hidden when the user signs in, before Companion connects to
`http://127.0.0.1:4587`. The official Companion module intentionally has no
`Bridge start`, `Bridge stop`, or `Bridge restart` actions.

To uninstall, run
`%LOCALAPPDATA%\CraftyBridge\Uninstall-CraftyBridge.ps1`.

## Pairing / Selecting A Device

If multiple BLE devices are nearby:

1. In Companion, add the `SCAN BLE` preset and press it.
2. Watch `$(crafty-bridge:seen_devices)` or use the `Seen BLE devices` preset.
3. Select the target in `Known/seen BLE device`, or copy the target id into `Preferred BLE device ID`.
4. Press `APPLY DEVICE CONFIG`.
5. Press `CONNECT`.

The bridge stores the selected device in:

```text
crafty-bridge-config.json
```

Known devices are stored in the same file. If pairing gets confusing, use the `Forget known devices` preset or delete `crafty-bridge-config.json` while the bridge is stopped.

## Updating

1. Stop the bridge.
2. Replace/update files.
3. Run `npm install`.
4. Start the bridge.
5. Import the new `.tgz` module into Companion.
6. Toggle the Companion connection off/on.
