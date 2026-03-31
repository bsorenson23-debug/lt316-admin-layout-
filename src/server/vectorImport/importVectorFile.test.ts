import assert from "node:assert/strict";
import test from "node:test";
import { convertVectorBufferToSvg, detectVectorFormat } from "./importVectorFile.ts";

function buildSinglePagePdf(): Buffer {
  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
  };

  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 120] /Contents 4 0 R >>");

  const stream = "0 0 0 RG\n1 w\n10 10 m\n110 110 l\nS\n";
  addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

test("detects pdf-compatible Illustrator files", () => {
  const buffer = Buffer.from("prefix%PDF-1.7", "latin1");
  assert.equal(detectVectorFormat("logo.ai", "application/illustrator", buffer), "ai-pdf");
});

test("detects PostScript Illustrator files", () => {
  const buffer = Buffer.from("%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator", "latin1");
  assert.equal(detectVectorFormat("logo.ai", "application/illustrator", buffer), "ai-postscript");
});

test("converts EPS into SVG", async () => {
  const eps = Buffer.from(
    "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\nnewpath 10 10 moveto 90 90 lineto stroke\nshowpage\n",
    "latin1",
  );

  const converted = await convertVectorBufferToSvg({
    fileName: "sample.eps",
    mimeType: "application/postscript",
    buffer: eps,
  });

  assert.equal(converted.name, "sample.svg");
  assert.match(converted.svgText, /<svg[\s>]/i);
  assert.match(converted.svgText, /<path/i);
});

test("converts DXF into SVG", async () => {
  const dxf = Buffer.from(
    "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nENDSEC\n0\nEOF\n",
    "utf8",
  );

  const converted = await convertVectorBufferToSvg({
    fileName: "sample.dxf",
    mimeType: "application/dxf",
    buffer: dxf,
  });

  assert.equal(converted.name, "sample.svg");
  assert.match(converted.svgText, /<svg[\s>]/i);
  assert.match(converted.svgText, /<line|<path/i);
  assert.deepEqual(converted.warnings, ["DXF text, dimensions, and hatches may need manual cleanup."]);
});

test("converts PDF into SVG", async () => {
  const converted = await convertVectorBufferToSvg({
    fileName: "sample.pdf",
    mimeType: "application/pdf",
    buffer: buildSinglePagePdf(),
  });

  assert.equal(converted.name, "sample.svg");
  assert.match(converted.svgText, /<svg[\s>]/i);
  assert.match(converted.svgText, /<path/i);
  assert.deepEqual(converted.warnings, []);
});
