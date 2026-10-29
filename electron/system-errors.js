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

export function patchSystemErrors() {
  return util.getSystemErrorName;
}
