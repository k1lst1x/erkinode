# Files and SFTP

Choose **SFTP** on a saved host, or switch an active SSH session to its SFTP pane. SFTP uses the authenticated SSH connection and the server's permissions.

## Browse and transfer

Browse remote directories, navigate up the tree, and choose files or folders for upload/download. Use the local pane's native folder picker to grant access to a local directory. The app confines that pane to the selected directory; symbolic links cannot silently extend access outside the grant.

Transfers show progress and can be canceled. Recursive transfers preserve empty directories and refuse to overwrite an existing destination silently. A closed SSH connection cancels its transfers.

A transfer can fail even when the SSH login works: your user may lack access to the requested directory, the destination may already exist, disk space may be insufficient, or the server may restrict SFTP.

## Edit remote text

Select a supported text file and open the editor. Saving checks the file's revision to avoid silently overwriting a remote change. If another process modified the file, reload and reconcile the changes before saving again.

The editor is for text files, not a replacement for a binary editor or an entire remote IDE.

## File actions

Remote actions include creating directories, renaming, deleting eligible entries, and changing permissions. Destructive actions require confirmation. Remote deletion is not sent to your computer's Trash and cannot be undone by Erkinode. Non-empty directory deletion is intentionally restricted.

Local terminal tabs do not have an SFTP view. Use normal shell commands for local files or open a saved remote host for SFTP.
