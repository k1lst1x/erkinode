# Your first SSH connection

## Save a host

1. Choose **New host**. Give the connection a recognizable name.
2. Enter the server's address, SSH port (usually `22`), and actual login username.
3. In **Authentication**, choose a password, private key, or SSH agent.
4. Add a group, tags, or notes if useful, then save the host.
5. Select **SSH** to open a terminal, or **SFTP** to browse files.

The display name is just a label. It does not affect the server login. Your server must already have SSH enabled and be reachable from this computer.

## Verify the server

On the first connection, Erkinode displays the server's SHA-256 host-key fingerprint. Compare it with the administrator's fingerprint through an independent channel before trusting it. The fingerprint identifies the server; your password or private key identifies you.

If a previously trusted key changes, Erkinode blocks the connection. Investigate first. Reinstalling a server can legitimately change its key, but a change can also indicate that you are reaching a different machine. Remove a known fingerprint under **Keys and trust** only after verifying the replacement.

## Passwords, keys, and agents

A saved password is encrypted in the local vault. You can leave a password blank to enter it when connecting. For a one-time retry after a rejected password, choose **Enter password again**; this does not replace the saved password. Edit the host to update it permanently.

For private-key authentication, import the private key rather than its `.pub` file. Encrypted keys can use a saved or per-connection passphrase. Never send your private key or password in a bug report.

SSH-agent authentication requires a usable agent. Current agent integration is based on `SSH_AUTH_SOCK`; native Windows OpenSSH named-pipe behavior needs separate validation. See [platform support](../platforms/).

## Jump hosts

A jump host is an intermediate SSH server used to reach another machine on a private network:

```text
Your computer → jump host → private target server
```

Save the intermediate server as a host. Then select it in the target host's **Jump host** field. The username and authentication in the target form belong to the target, not the jump host. Hover or focus the information icon for a reminder.

Leave **Direct connection** selected when the target is directly reachable. Jump chains are supported with cycle detection and a bounded chain length.

## System icons

After authentication, Erkinode makes bounded, read-only checks to identify the remote OS. It can display distro-specific logos when release metadata is available, or a general Linux/Unix/server icon when information is limited. A login username such as `ubuntu` is not used as proof of the OS. See [remote system detection](../remote-systems/).

## Local port forwarding

Use **Tunnel** from an active SSH session to forward a loopback port on your computer to a host and port reachable from that server. Closing the SSH session closes its tunnels. This is local forwarding, not a VPN or a remote/reverse forwarding feature.
