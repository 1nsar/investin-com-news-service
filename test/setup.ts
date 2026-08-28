/** Test environment defaults.
 *
 *  `src/config/index.ts` validates the environment at import time, and the
 *  provider adapters import it transitively. Without this, `npm test` on a
 *  fresh clone dies at collection with "DATABASE_URL: Required", and with a
 *  copied .env but no key it fails six provider tests for a reason that has
 *  nothing to do with the code under test.
 *
 *  These values are never connected to or sent anywhere - the unit tests are
 *  pure. They exist so the suite is hermetic: `git clone && npm install &&
 *  npm test` must pass with no .env and no credentials of any kind. */
process.env["DATABASE_URL"] ??= "postgres://test:test@127.0.0.1:5432/test";
process.env["FINNHUB_API_KEY"] ??= "test-key-not-a-credential";
