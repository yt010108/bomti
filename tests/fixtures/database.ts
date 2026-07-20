// @ts-nocheck
// The executable fixture remains ESM JavaScript so the database runner can
// invoke it without a TypeScript build step. Vitest imports it through this
// typed module boundary.
export {
  advanceDeletionJob,
  createDeletionLifecycleFixture,
  createDatabaseFixture,
  databaseSql,
  databaseEnvironment,
  deleteAuthUser,
  installDeletionFailureTrigger,
  purgeAccountData,
  removeDeletionFailureTrigger,
  rest,
  rpc,
  signInAfterDeletion
} from "./database.mjs";
