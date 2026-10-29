# Local terminals

## Interaction

- **Local terminal** in the sidebar and Hosts header starts an independent shell. The tab bar **+** does the same; the adjacent server button returns to saved hosts.
- **File → New local terminal**, Cmd+T (macOS) / Ctrl+Shift+T (Windows/Linux), and **File → Open terminal in folder**, Cmd+Shift+T (macOS) / Ctrl+Alt+T (Windows/Linux), are native Electron menu actions. There is one shortcut owner, preventing duplicate tabs.
- Default directory: the current user's home. **Open in folder…** opens a native directory picker and creates another tab without interrupting the current shell. Canceling does nothing.
- Local tabs are labeled `Local · <shell>`. Their toolbar identifies the computer, shell, and starting directory. The directory is the launch directory, not a live working-directory tracker.
- Local and SSH terminals share xterm.js rendering, ANSI/UTF-8, scrollback, search, font size, snippets, split panes, and live UI language switching. Each shell has its own process, environment, and working directory.
- Close the active tab with Cmd+W (macOS) / Ctrl+Shift+W (Windows/Linux). Standard shell Ctrl+T and Ctrl+W remain available on Windows/Linux.
- No SFTP pane or SSH tunnel is offered for local sessions. SSH host counts exclude local tabs.
- `exit` leaves the output visible in a closed tab. Starting a new shell from that tab replaces it. Tab close stops the shell; the window-close confirmation includes local processes.

## Runtime and boundaries

`electron/local-terminals.js` manages node-pty sessions in Electron's main process. A local session is allocated first; the PTY starts only after TerminalView subscribes, preserving initial prompt output. Existing input/resize/ack/close IPC is routed by session ID. SSH-only operations remain routed through Connections, so local IDs cannot become SFTP connections or tunnels.

The renderer cannot select an executable, command line, environment, or arbitrary startup path. The main process chooses the user's login shell and grants directory selection through a native dialog. macOS/Linux use the user's configured shell with login arguments for common shells, falling back to zsh/bash/sh. Windows prefers the conventional PowerShell 7 installation, then Windows PowerShell, then ComSpec. No execution-policy override or privilege elevation is requested.

The shell inherits normal user environment variables, including SSH_AUTH_SOCK and PATH, with Electron/Erkinode control variables and Node injection flags removed. Login shells read normal user configuration; Erkinode does not edit shell dotfiles. Local commands have ordinary user-level access, as expected for a terminal.

xterm output acknowledgements pause PTY reads above a bounded high-water mark and resume below the low-water mark. Input and resize messages are checked. Sessions are capped at 32 local tabs. Closing tabs, the window, or the app disposes PTY listeners and terminates shells. On Unix, owned descendant jobs receive SIGTERM before native PTY shutdown; this covers shells such as dash that do not forward HUP to background jobs. Windows uses ConPTY process-tree termination. Local sessions and terminal output are not written to the vault or backup; shell-managed history follows the user's shell settings.

## Native builds

Run `pnpm native:setup` after dependency installation, including `--ignore-scripts` installations. This validates packaged N-API binaries where supplied, fixes the Unix spawn helper's executable permission, or builds with node-gyp on platforms without a prebuild. Linux needs Python 3, make, and a C++ toolchain. Native builds need the target OS/architecture; a macOS binary is not a Windows/Linux package.

node-pty is unpacked from ASAR, including its native module and executable helper. The N-API dependency supports the Node/Electron runtime without a legacy V8 ABI rebuild. Installed-app smoke must actually launch a local shell to verify native packaging; a source-only test is insufficient.

## Validation

Backend checks cover shell selection, filtered environments, startup errors, lazy/idempotent launch, resize bounds, input limits, backpressure, exit, and independent cleanup. A real Unix PTY test exercises TTY detection, selected cwd, resize, Ctrl+C, and exit. Electron E2E covers native menu creation, multiple tabs, directory selection, keyboard input, splitting, SSH coexistence, restart, and tab cleanup.

macOS arm64 is the locally exercised desktop. Windows/Linux configurations and profile-selection tests do not replace installed desktop testing on those systems.
