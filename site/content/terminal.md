# Local and remote terminals

Choose **Local terminal** in the sidebar to run commands on your own computer. It opens a new tab in the home directory using your configured login shell on macOS/Linux or PowerShell on Windows.

## Keyboard shortcuts

| Action                          | macOS       | Windows / Linux |
| ------------------------------- | ----------- | --------------- |
| New local terminal              | Cmd+T       | Ctrl+Shift+T    |
| New terminal in a chosen folder | Cmd+Shift+T | Ctrl+Alt+T      |
| Close active tab                | Cmd+W       | Ctrl+Shift+W    |
| Search terminal output          | Cmd+F       | Ctrl+F          |
| New saved host                  | Cmd+N       | Ctrl+N          |
| Settings                        | Cmd+,       | Ctrl+,          |

Shell shortcuts such as Ctrl+C, Ctrl+D, and Tab work inside the terminal. On Windows/Linux, Ctrl+T and Ctrl+W remain available to the shell rather than being consumed by tab management.

## Know where a command will run

Local tabs are labeled **Local · shell-name**. Their footer says **Running on this device**. SSH tabs identify the remote login and show the connection state. Check the active tab before executing a command.

The local toolbar shows the computer, shell, and **starting folder**. That folder is not a live directory tracker: using `cd` changes the shell's working directory without changing the starting-folder label.

## Tabs and split panes

The tab-bar **+** opens another local terminal. The adjacent server button returns to saved hosts. Use the split button to see two sessions side by side. Local and remote terminals can remain open while you browse hosts, settings, or snippets.

Use **Open in folder…** inside a local tab to choose the starting directory for another tab. It does not interrupt the current shell. `exit` ends a local shell while retaining its output in a closed tab; choose **New local terminal** there to start another one.

## Shell configuration

Login shells read your usual shell configuration, so tools configured through Homebrew, language managers, or shell dotfiles can be available. Erkinode does not modify those files. Behavior still depends on your shell configuration and environment.

Local commands run with your normal user permissions, just as in an OS terminal. Closing a tab stops its shell; closing the app stops its terminal sessions. Erkinode does not provide persistent server-side multiplexing: use tools such as `tmux` on a server if a job needs to survive a client disconnect.

## Snippets and appearance

Save frequently used commands under **Snippets** and insert them into the active terminal. Insertion does not execute them: review the command and press Enter yourself.

Adjust terminal font size in Settings. The terminal supports ANSI colors, UTF-8, scrollback, resizing, and search. The app's language setting translates the interface, not shell output or your commands.
