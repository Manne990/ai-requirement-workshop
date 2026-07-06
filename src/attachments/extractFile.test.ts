import { describe, expect, it } from "vitest";
import { extractAttachmentDrafts } from "./extractFile";

describe("attachment extraction", () => {
  it("extracts text attachments into source-ready drafts", async () => {
    const [draft] = await extractAttachmentDrafts([
      new File(["alarm_id,status\n1,active"], "alarms.csv", {
        type: "text/csv",
      }),
    ]);

    expect(draft?.name).toBe("alarms.csv");
    expect(draft?.status).toBe("extracted");
    expect(draft?.summary).toContain("alarm_id");
    expect(draft?.tags).toContain("file:csv");
    expect(draft?.tags).toContain("security:accepted");
  });

  it("rejects unsupported attachment types before extraction", async () => {
    await expect(
      extractAttachmentDrafts([
        new File(["binary"], "capture.png", { type: "image/png" }),
      ]),
    ).rejects.toThrow("Unsupported attachment type");
  });

  it("rejects oversized attachments before extraction", async () => {
    await expect(
      extractAttachmentDrafts(
        [new File(["123456"], "large.txt", { type: "text/plain" })],
        {
          maxFileSizeBytes: 4,
          supportedExtensions: ["txt"],
          supportedMimeTypes: ["text/plain"],
        },
      ),
    ).rejects.toThrow("exceeds the");
  });

  it("blocks private key material from entering the workshop runtime", async () => {
    await expect(
      extractAttachmentDrafts([
        new File(
          [
            [
              "-----BEGIN PRIVATE KEY-----",
              "abcdef0123456789",
              "-----END PRIVATE KEY-----",
            ].join("\n"),
          ],
          "private-key.txt",
          { type: "text/plain" },
        ),
      ]),
    ).rejects.toThrow("Private key material blocks attachment intake");
  });
});
