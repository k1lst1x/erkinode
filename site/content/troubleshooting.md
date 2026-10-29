# Troubleshooting

## The server rejects my login

Check the exact username, port, and authentication method. A successful login in another terminal might be using an SSH agent or private key rather than a password.

After a password failure, use **Enter password again** for a one-time retry. If it works, edit the host to update its saved password. Do not paste the password into an issue.

Expand **Technical details** in the connection error for more context. Keyboard-interactive and key-passphrase prompts are separate from a saved login password.

## A Linux icon appears instead of Ubuntu

The application determined the kernel family but did not obtain enough distro metadata. A kernel version or a username does not uniquely identify Ubuntu. Restricted SFTP access or a probe timeout can limit detection. A generic icon does not mean the SSH connection is broken.

## The local terminal cannot start

Check that the configured system login shell still exists and can start in the OS terminal. A broken startup script can also prevent a normal prompt. The error's technical details can help distinguish a missing executable from a failed native PTY launch.

For a source build, run `pnpm native:setup`. For a downloaded app, verify that it matches the device architecture and comes from a complete release. See [installation](../installation/).

## I changed source code but the app looks the same

A production `.app` is a separate build. Editing source files or rebuilding `dist/` does not update an installed application. Quit the old app, create a new package, and replace the installed copy. `pnpm dev` builds once and launches the source app; it is not a hot-reloading dev server.

Check the exact version in **About Erkinode**. Multiple application copies can cause the Dock or Spotlight to open an older build.

## SFTP works but a transfer fails

Check destination permissions, available space, and existing filenames. A remote SSH login does not grant access to every remote path. Read [files and SFTP](../files/) for overwrite and deletion behavior.

## I cannot see download buttons

The site lists actual GitHub Release assets. A source push publishes the website but does not itself create desktop installers. The maintainer must run the release workflow. If GitHub's release API is unavailable or rate limited, use the **All releases** link for manual downloads.

## Where are language settings?

Open **Settings → Language** and choose English, Русский, or Қазақша. The choice is saved locally. Terminal output and server messages retain their original language.
