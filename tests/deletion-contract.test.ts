import { describe, expect, it } from "vitest";
import { nextDeletionJobUpdate } from "../lib/database/deletion";

const subjectHmac = "f".repeat(64);
const ciphertext = new Uint8Array([1, 2, 3]);

describe("account deletion transition payload", () => {
  it("scrubs ciphertext at auth deletion and the subject marker at completion", () => {
    expect(nextDeletionJobUpdate("requested", ciphertext, subjectHmac)).toEqual({
      state: "sessions_revoked",
      encryptedAuthUserId: ciphertext,
      subjectHmac
    });
    expect(nextDeletionJobUpdate("app_data_deleted", ciphertext, subjectHmac)).toEqual({
      state: "auth_user_deleted",
      encryptedAuthUserId: null,
      subjectHmac
    });
    expect(nextDeletionJobUpdate("auth_user_deleted", null, subjectHmac)).toEqual({
      state: "complete",
      encryptedAuthUserId: null,
      subjectHmac: null
    });
  });

  it("rejects missing lifecycle secrets and transitions after completion", () => {
    expect(() => nextDeletionJobUpdate("requested", null, subjectHmac)).toThrow(
      "ACCOUNT_DELETION_AUTH_CIPHERTEXT_REQUIRED"
    );
    expect(() => nextDeletionJobUpdate("requested", ciphertext, null)).toThrow(
      "ACCOUNT_DELETION_SUBJECT_MARKER_REQUIRED"
    );
    expect(() => nextDeletionJobUpdate("complete", null, null)).toThrow("ACCOUNT_DELETION_ALREADY_COMPLETE");
  });
});
