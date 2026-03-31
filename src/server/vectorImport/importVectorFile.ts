import path from "node:path";
import { Writable } from "node:stream";
import { Helper as DxfHelper } from "dxf";
import { getVectorFileExtension, normalizeImportedVectorName } from "../../lib/vectorImport.ts";

export type DetectedVectorFormat =
  | "svg"
  | "pdf"
  | "ai-pdf"
  | "ai-postscript"
  | "eps"
  | "ps"
  | "dxf";

export interface ConvertedVectorFile {
  name: string;
  svgText: string;
  warnings: string[];
  detectedFormat: DetectedVectorFormat;
}

interface PdfPageLike {
  commonObjs: unknown;
  objs: unknown;
  getOperatorList(): Promise<unknown>;
  getViewport(options: { scale: number; offsetY: number }): { width: number; height: number; transform: number[] };
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  destroy?: () => Promise<void> | void;
}

interface PdfJsLike {
  GlobalWorkerOptions: { workerSrc: string };
  VerbosityLevel: { WARNINGS: number };
  SVGGraphics: new (commonObjs: unknown, objs: unknown, forceDataSchema?: boolean) => {
    embedFonts: boolean;
    defs: unknown;
    viewport: unknown;
    svg: unknown;
    objs: unknown;
    svgFactory: {
      create(width: number, height: number): unknown;
      createElement(name: string): unknown;
    };
    loadDependencies(opList: unknown): Promise<void>;
    convertOpList(opList: unknown): unknown;
    group(elements: unknown): void;
  };
  getDocument(options: Record<string, unknown>): { promise: Promise<PdfDocumentLike> };
}

interface PdfDomStubsLike {
  setStubs(namespace: object): void;
  unsetStubs(namespace: object): void;
}

interface PdfSerializerLike {
  serializeSvgToStream(
    elem: unknown,
    writable: Writable,
    options?: { floatPrecision?: number; inheritedFontsAttr?: boolean },
  ): Promise<void>;
}

const SVG_MARKUP_RE = /<svg[\s>]/i;
const POSTSCRIPT_HEADER_RE = /%!\s*PS-Adobe/i;
const BOUNDING_BOX_RE = /%%BoundingBox:/i;
const DXF_HEADER_RE = /^\s*0\s*\r?\nSECTION\b/i;
const DXF_FOOTER_RE = /\r?\n0\s*\r?\nEOF\b/i;
const SVG_PREVIEW_BYTES = 64 * 1024;
const PDF_SIGNATURE = Buffer.from("%PDF-", "latin1");

let pdfDomStubRefCount = 0;
let postscriptConverterPromise:
  | Promise<{
      convertPostscriptToSVG(psText: string): string;
    }>
  | null = null;
let pdfModulesPromise:
  | Promise<{
      pdfjs: PdfJsLike;
      domStubs: PdfDomStubsLike;
      serializer: PdfSerializerLike;
      workerSrc: string;
      standardFontDataUrl: string;
    }>
  | null = null;

function importAtRuntime<T>(specifier: string): Promise<T> {
  const loader = new Function("modulePath", "return import(modulePath);") as (modulePath: string) => Promise<T>;
  return loader(specifier);
}

function previewText(buffer: Buffer): string {
  return buffer.subarray(0, Math.min(buffer.length, SVG_PREVIEW_BYTES)).toString("latin1");
}

function looksLikeSvg(preview: string): boolean {
  return SVG_MARKUP_RE.test(preview);
}

function looksLikePostscript(preview: string): boolean {
  return POSTSCRIPT_HEADER_RE.test(preview) || BOUNDING_BOX_RE.test(preview);
}

function looksLikeDxf(preview: string): boolean {
  return DXF_HEADER_RE.test(preview) || DXF_FOOTER_RE.test(preview);
}

function looksLikePdf(buffer: Buffer): boolean {
  return buffer.indexOf(PDF_SIGNATURE) >= 0;
}

function assertSvgOutput(svgText: string, sourceName: string) {
  if (!SVG_MARKUP_RE.test(svgText)) {
    throw new Error(`Failed to convert ${sourceName} into SVG`);
  }
}

export function detectVectorFormat(
  fileName: string,
  mimeType: string | null | undefined,
  buffer: Buffer,
): DetectedVectorFormat | null {
  const ext = getVectorFileExtension(fileName);
  const preview = previewText(buffer);
  const hasPdfSignature = looksLikePdf(buffer);
  const hasPostscriptSignature = looksLikePostscript(preview);
  const hasSvgSignature = looksLikeSvg(preview);
  const hasDxfSignature = looksLikeDxf(preview);
  const normalizedMimeType = mimeType?.toLowerCase() ?? "";

  if (hasSvgSignature) return "svg";
  if (hasPdfSignature) {
    return ext === ".ai" ? "ai-pdf" : "pdf";
  }
  if (hasPostscriptSignature) {
    if (ext === ".ai") return "ai-postscript";
    if (ext === ".ps") return "ps";
    return "eps";
  }
  if (hasDxfSignature) return "dxf";

  if (ext === ".svg" || normalizedMimeType === "image/svg+xml") return "svg";
  if (ext === ".pdf" || normalizedMimeType === "application/pdf") return "pdf";
  if (ext === ".dxf" || normalizedMimeType === "application/dxf" || normalizedMimeType === "image/vnd.dxf") {
    return "dxf";
  }
  if (ext === ".eps") return "eps";
  if (ext === ".ps") return "ps";
  if (ext === ".ai" || normalizedMimeType === "application/illustrator") return "ai-postscript";

  return null;
}

function unsupportedVectorMessage(fileName: string): string {
  const ext = getVectorFileExtension(fileName);
  if (ext === ".ai") {
    return "Unsupported Illustrator file. Save it as a PDF-compatible .ai or as .eps, then import again.";
  }
  return "Unsupported vector file. Use SVG, AI, EPS, PS, PDF, or DXF.";
}

function withMutedConsoleTimers<T>(work: () => T): T {
  const originalTime = console.time;
  const originalTimeEnd = console.timeEnd;
  console.time = (() => {}) as typeof console.time;
  console.timeEnd = (() => {}) as typeof console.timeEnd;
  try {
    return work();
  } finally {
    console.time = originalTime;
    console.timeEnd = originalTimeEnd;
  }
}

async function withMutedConsoleTimersAsync<T>(work: () => Promise<T>): Promise<T> {
  const originalTime = console.time;
  const originalTimeEnd = console.timeEnd;
  console.time = (() => {}) as typeof console.time;
  console.timeEnd = (() => {}) as typeof console.timeEnd;
  try {
    return await work();
  } finally {
    console.time = originalTime;
    console.timeEnd = originalTimeEnd;
  }
}

async function collectSvgString(
  serializer: PdfSerializerLike,
  svgElement: unknown,
): Promise<string> {
  let output = "";
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });

  await serializer.serializeSvgToStream(svgElement, writable, {
    floatPrecision: 3,
    inheritedFontsAttr: true,
  });

  return output;
}

function acquirePdfDomStubs(domStubs: PdfDomStubsLike): () => void {
  if (pdfDomStubRefCount === 0) {
    domStubs.setStubs(globalThis);
  }
  pdfDomStubRefCount += 1;

  return () => {
    pdfDomStubRefCount = Math.max(0, pdfDomStubRefCount - 1);
    if (pdfDomStubRefCount === 0) {
      domStubs.unsetStubs(globalThis);
    }
  };
}

async function getPdfModules() {
  if (!pdfModulesPromise) {
    pdfModulesPromise = (async () => {
      const [pdfjsNs, domStubsNs, serializerNs] = await Promise.all([
        importAtRuntime("@postscriptum.app/pdf2svg/dist/libs/pdf.js"),
        importAtRuntime("@postscriptum.app/pdf2svg/dist/domstubs.js"),
        importAtRuntime("@postscriptum.app/pdf2svg/dist/serializer.js"),
      ]);

      const pdfjsModule = pdfjsNs as { default?: unknown };
      const domStubsModule = domStubsNs as { default?: unknown };
      const serializerModule = serializerNs as { default?: unknown };
      const pdfjs = (pdfjsModule.default ?? pdfjsNs) as PdfJsLike;
      const domStubs = (domStubsModule.default ?? domStubsNs) as PdfDomStubsLike;
      const serializer = (serializerModule.default ?? serializerNs) as PdfSerializerLike;
      const pdf2svgRoot = path.resolve(process.cwd(), "node_modules", "@postscriptum.app", "pdf2svg", "dist");

      return {
        pdfjs,
        domStubs,
        serializer,
        workerSrc: path.join(pdf2svgRoot, "libs", "pdf.worker.js"),
        standardFontDataUrl: `${path.join(pdf2svgRoot, "fonts")}${path.sep}`,
      };
    })();
  }

  return pdfModulesPromise;
}

async function getPostscriptConverter() {
  if (!postscriptConverterPromise) {
    postscriptConverterPromise = withMutedConsoleTimersAsync(() => importAtRuntime("ps2svg/dist/v3/ps2svg_v3.js"));
  }

  return postscriptConverterPromise;
}

async function convertPdfToSvg(buffer: Buffer): Promise<{ svgText: string; pageCount: number }> {
  const { pdfjs, domStubs, serializer, workerSrc, standardFontDataUrl } = await getPdfModules();
  const releaseDomStubs = acquirePdfDomStubs(domStubs);
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  let pdf: PdfDocumentLike | null = null;
  try {
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      verbosity: pdfjs.VerbosityLevel.WARNINGS,
      fontExtraProperties: true,
      standardFontDataUrl,
    }).promise;

    const page = await pdf.getPage(1);
    const opList = await page.getOperatorList();
    const viewport = page.getViewport({ scale: 96 / 72, offsetY: 0 });
    const svgGfx = new pdfjs.SVGGraphics(page.commonObjs, page.objs, true);
    svgGfx.embedFonts = true;

    const svg = svgGfx.svgFactory.create(viewport.width, viewport.height) as {
      appendChild(child: unknown): void;
    };
    const defs = svgGfx.svgFactory.createElement("svg:defs");
    svg.appendChild(defs);
    svgGfx.defs = defs;
    svgGfx.viewport = viewport;

    const pageGroup = (globalThis as { document: { createElementNS(ns: string, name: string): unknown } }).document
      .createElementNS("http://www.w3.org/2000/svg", "svg:g") as {
        setAttributeNS(ns: string | null, name: string, value: string): void;
      };

    pageGroup.setAttributeNS(null, "transform", `matrix(${viewport.transform.join(" ")})`);
    svg.appendChild(pageGroup);
    svgGfx.svg = pageGroup;
    svgGfx.objs = page.objs;
    await svgGfx.loadDependencies(opList);
    svgGfx.group(svgGfx.convertOpList(opList));

    return {
      svgText: await collectSvgString(serializer, svg),
      pageCount: pdf.numPages,
    };
  } finally {
    releaseDomStubs();
    await pdf?.destroy?.();
  }
}

function convertDxfToSvg(buffer: Buffer): string {
  const helper = new DxfHelper(buffer.toString("utf8"));
  return helper.toSVG();
}

async function convertPostscriptBufferToSvg(buffer: Buffer): Promise<string> {
  const converter = await getPostscriptConverter();
  return withMutedConsoleTimers(() => converter.convertPostscriptToSVG(buffer.toString("latin1")));
}

export async function convertVectorBufferToSvg(args: {
  fileName: string;
  mimeType?: string | null;
  buffer: Buffer;
}): Promise<ConvertedVectorFile> {
  const detectedFormat = detectVectorFormat(args.fileName, args.mimeType, args.buffer);
  if (!detectedFormat) {
    throw new Error(unsupportedVectorMessage(args.fileName));
  }

  const warnings: string[] = [];
  let svgText = "";

  switch (detectedFormat) {
    case "svg":
      svgText = args.buffer.toString("utf8");
      break;
    case "pdf":
    case "ai-pdf": {
      const pdfResult = await convertPdfToSvg(args.buffer);
      svgText = pdfResult.svgText;
      if (pdfResult.pageCount > 1) {
        warnings.push(`Imported page 1 of ${pdfResult.pageCount}.`);
      }
      if (detectedFormat === "ai-pdf") {
        warnings.push("Imported from a PDF-compatible Illustrator file.");
      }
      break;
    }
    case "eps":
    case "ps":
    case "ai-postscript":
      svgText = await convertPostscriptBufferToSvg(args.buffer);
      if (detectedFormat === "ai-postscript") {
        warnings.push("Imported from a PostScript-based Illustrator file.");
      }
      break;
    case "dxf":
      svgText = convertDxfToSvg(args.buffer);
      warnings.push("DXF text, dimensions, and hatches may need manual cleanup.");
      break;
    default:
      throw new Error(unsupportedVectorMessage(args.fileName));
  }

  assertSvgOutput(svgText, args.fileName);

  return {
    name: normalizeImportedVectorName(args.fileName),
    svgText,
    warnings,
    detectedFormat,
  };
}
