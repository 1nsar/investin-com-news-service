import { cp, mkdir } from "node:fs/promises";

/** tsc emits .ts only, so the .sql migration files would be missing from the
 *  compiled output - and the migration runner resolves them relative to its
 *  own location. Without this the Docker image starts against an empty
 *  schema and every query fails. Part of `npm run build` for that reason. */
await mkdir("dist/src/db/migrations", { recursive: true });
await cp("src/db/migrations", "dist/src/db/migrations", { recursive: true });
console.log("copied SQL migrations into dist/");
