import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** True when this module is the process entrypoint.
 *
 *  Comparing `import.meta.url` to `process.argv[1]` directly is unreliable:
 *  the runner may hand over a relative path, a path through a symlink, or one
 *  without the extension. Resolving both to a real path first makes the check
 *  behave the same under `node`, `tsx` and the compiled build. */
export function isMainModule(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === importMetaUrl;
  } catch {
    return false;
  }
}
