import util from "node:util";

const origGetSystemErrorName = util.getSystemErrorName;
if (!util.__erkinodeSystemErrorGuard) {
  util.__erkinodeSystemErrorGuard = true;
  util.getSystemErrorName = function getSystemErrorName(err) {
    if (typeof err === "number" && err > 0) {
      try {
        return origGetSystemErrorName(-err);
      } catch {
        return `ERR_${err}`;
      }
    }
    return origGetSystemErrorName(err);
  };
}

/**
 * Guard against positive errno values that crash the Electron main process.
 *
 * Node.js internal code (node:internal/errors → ErrnoException) captures a
 * reference to the *original* getSystemErrorName at module-load time, long
 * before our monkey-patch above runs.  When a TCP socket emits an error with
 * a positive errno (observed on macOS: errno 4 = EINTR, errno 57 = ENOTCONN),
 * the internal code throws:
 *
 *   RangeError [ERR_OUT_OF_RANGE]: The value of "err" is out of range.
 *     It must be a negative integer.  Received 4
 *     at Object.getSystemErrorName (node:util:455:11)
 *     at new ErrnoException (node:internal/errors:734:23)
 *     at TCP.onStreamRead (node:internal/stream_base_commons:221:20)
 *
 * The only reliable way to prevent the crash is a process-level handler.
 * We catch only this specific RangeError and suppress it — the originating
 * stream will still fire its own 'error' / 'close' events so the connection
 * is cleaned up normally by ssh2 or net.Socket handlers.
 */
export function installUncaughtGuard() {
  if (process.__erkinodeUncaughtGuard) return;
  process.__erkinodeUncaughtGuard = true;
  process.on("uncaughtException", (err, origin) => {
    // Only suppress the exact positive-errno RangeError from TCP/pipe reads.
    if (
      err?.code === "ERR_OUT_OF_RANGE" &&
      err instanceof RangeError &&
      /getSystemErrorName|onStreamRead|onread/i.test(err.stack || "")
    ) {
      // Swallowed: the underlying socket will still close/error normally.
      return;
    }
    // Everything else is a real bug — re-throw so Electron shows the dialog.
    throw err;
  });
}

export function patchSystemErrors() {
  installUncaughtGuard();
  return util.getSystemErrorName;
}
