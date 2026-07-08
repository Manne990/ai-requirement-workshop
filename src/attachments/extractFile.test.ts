import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
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

  it("extracts text from PDF attachments", async () => {
    const [draft] = await extractAttachmentDrafts([
      createPdfFile("Alarm dashboard requirements from PDF"),
    ]);

    expect(draft?.name).toBe("requirements.pdf");
    expect(draft?.status).toBe("extracted");
    expect(draft?.summary).toContain("Alarm dashboard requirements");
    expect(draft?.tags).toContain("file:pdf");
    expect(draft?.tags).toContain("mime:application/pdf");
  });

  it("extracts PDF text when ReadableStream async iteration is unavailable", async () => {
    const readableStreamPrototype = ReadableStream.prototype as ReadableStream &
      Record<PropertyKey, unknown>;
    const originalAsyncIterator = readableStreamPrototype[Symbol.asyncIterator];
    const originalValues = readableStreamPrototype.values;

    Object.defineProperty(readableStreamPrototype, Symbol.asyncIterator, {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(readableStreamPrototype, "values", {
      configurable: true,
      value: undefined,
    });

    try {
      const [draft] = await extractAttachmentDrafts([
        createPdfFile("PDF stream reader fallback"),
      ]);

      expect(draft?.status).toBe("extracted");
      expect(draft?.summary).toContain("PDF stream reader fallback");
    } finally {
      Object.defineProperty(readableStreamPrototype, Symbol.asyncIterator, {
        configurable: true,
        value: originalAsyncIterator,
      });
      Object.defineProperty(readableStreamPrototype, "values", {
        configurable: true,
        value: originalValues,
      });
    }
  });

  it("extracts readable worksheet context from Mathcad MCDX attachments", async () => {
    const [draft] = await extractAttachmentDrafts([createMcdxFile()]);

    expect(draft?.name).toBe("vaggskiva.mcdx");
    expect(draft?.status).toBe("extracted");
    expect(draft?.summary).toContain("Väggskiva dimensionering");
    expect(draft?.summary).toContain("Crack width requirement");
    expect(draft?.tags).toContain("file:mcdx");
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

function createPdfFile(text: string) {
  const content = `BT /F1 18 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new File([pdf], "requirements.pdf", { type: "application/pdf" });
}

function createMcdxFile() {
  const xamlPackage = zipSync({
    "Xaml/Document.xaml": strToU8(
      "<FlowDocument><Paragraph><Run>Crack width requirement from XAML</Run></Paragraph></FlowDocument>",
    ),
  });
  const mcdx = zipSync({
    "mathcad/worksheet.xml": strToU8(
      [
        '<worksheet xmlns:ml="http://schemas.mathsoft.com/math50">',
        "<regions>",
        "<region><text><FlowDocument><Paragraph>Väggskiva dimensionering</Paragraph></FlowDocument></text></region>",
        '<region><math><ml:define><ml:id labels="VARIABLE">w_k</ml:id><ml:real>0.3</ml:real></ml:define></math></region>',
        "</regions>",
        "</worksheet>",
      ].join(""),
    ),
    "mathcad/result.xml": strToU8(
      '<resultsList xmlns:ml="http://schemas.mathsoft.com/math50"><resultData result-id="1"><ml:result><ml:real>207</ml:real></ml:result></resultData></resultsList>',
    ),
    "mathcad/xaml/FlowDocument0.XamlPackage": xamlPackage,
  });

  return new File([mcdx], "vaggskiva.mcdx", {
    type: "application/octet-stream",
  });
}

function escapePdfText(text: string) {
  return text.replace(/[()\\]/g, (character) => `\\${character}`);
}
