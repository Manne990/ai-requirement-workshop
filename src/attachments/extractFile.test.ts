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
  });
});
