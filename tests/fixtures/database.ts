// @ts-nocheck
// The executable fixture remains ESM JavaScript so the database runner can
// invoke it without a TypeScript build step. Vitest imports it through this
// typed module boundary.
export {
  createDatabaseFixture,
  databaseEnvironment,
  deleteAuthUser,
  purgeAccountData,
  rest,
  signInAfterDeletion
} from "./database.mjs";
