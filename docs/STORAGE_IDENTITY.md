# Storage identity

Erkinode uses one stable technical identity across upgrades:

- application and credential-store name `Erkinode`, including `~/Library/Application Support/Erkinode/` on macOS;
- bundle ID `io.github.k1lst1x.erkinode`;
- local custom protocol `erkinode://app/`;
- renderer bridge and IPC names `window.erkinode` and `erkinode:*`;
- portable backup family `erkinode-backup` with an independent numeric `formatVersion`;
- developer test environment variables beginning with `ERKINODE_`.

These identifiers are established by the first public beta and must remain stable. Changing the storage namespace, bundle ID, or credential-store identity later can make an existing encrypted vault appear missing or inaccessible. Any future migration requires an explicit versioned format, recovery and rollback behavior, and tests using real data produced by an earlier signed build.

The source repository folder can be renamed without moving the OS vault. New portable backups use the filename `erkinode-backup.vault`. Imports retain explicit compatibility with the historical `harbor-backup-v1` and `erkinode-backup-v1` markers. Every supported released format has a synthetic encrypted fixture in the test suite; future schema changes must add an ordered migration and preserve those tests.
