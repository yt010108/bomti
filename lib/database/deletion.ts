import type { Database } from "./generated.types";

export type AccountDeletionState = Database["public"]["Enums"]["account_deletion_state"];

const nextState: Record<AccountDeletionState, AccountDeletionState | null> = {
  requested: "sessions_revoked",
  sessions_revoked: "app_data_deleted",
  app_data_deleted: "auth_user_deleted",
  auth_user_deleted: "complete",
  complete: null
};

export type DeletionJobUpdate = {
  state: AccountDeletionState;
  encryptedAuthUserId: Uint8Array | null;
};

/**
 * The database trigger enforces the same invariant. Keeping this tiny
 * server-only transition contract next to the generated DB types prevents a
 * worker from retaining an auth-user ciphertext after that user is removed.
 */
export function nextDeletionJobUpdate(
  current: AccountDeletionState,
  encryptedAuthUserId: Uint8Array | null
): DeletionJobUpdate {
  const state = nextState[current];
  if (!state) throw new Error("ACCOUNT_DELETION_ALREADY_COMPLETE");
  if (current !== "auth_user_deleted" && encryptedAuthUserId === null) {
    throw new Error("ACCOUNT_DELETION_AUTH_CIPHERTEXT_REQUIRED");
  }

  return {
    state,
    encryptedAuthUserId: state === "auth_user_deleted" || state === "complete" ? null : encryptedAuthUserId
  };
}
