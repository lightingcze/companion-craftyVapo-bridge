CRAFTY BRIDGE FOR WINDOWS - INSTALLATION

1. Extract the complete ZIP file.
2. Double-click INSTALL.cmd.
3. Import the included companion-module-crafty-bridge .tgz file in Companion.
4. Add a Crafty Bridge connection using http://127.0.0.1:4587.

The installer does not need administrator rights or internet access. It verifies
the bundled official portable Node.js 22 runtime, installs the bridge and its
BLE dependencies under %LOCALAPPDATA%\CraftyBridge, starts it, and creates
automatic startup for the current Windows user.

To uninstall, run:
%LOCALAPPDATA%\CraftyBridge\Uninstall-CraftyBridge.ps1
