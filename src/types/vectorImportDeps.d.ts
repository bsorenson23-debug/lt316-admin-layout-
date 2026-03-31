declare module "dxf" {
  export class Helper {
    constructor(contents: string);
    toSVG(): string;
  }
}

declare module "ps2svg/dist/v3/ps2svg_v3.js" {
  export function convertPostscriptToSVG(psText: string): string;
}

declare module "@postscriptum.app/pdf2svg/dist/libs/pdf.js" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export const VerbosityLevel: { WARNINGS: number };
  export class SVGGraphics {
    embedFonts: boolean;
    defs: unknown;
    viewport: unknown;
    svg: unknown;
    objs: unknown;
    svgFactory: {
      create(width: number, height: number): unknown;
      createElement(name: string): unknown;
    };
    constructor(commonObjs: unknown, objs: unknown, forceDataSchema?: boolean);
    loadDependencies(opList: unknown): Promise<void>;
    convertOpList(opList: unknown): unknown;
    group(elements: unknown): void;
  }

  export function getDocument(options: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<unknown>;
      destroy?: () => Promise<void> | void;
    }>;
  };
}

declare module "@postscriptum.app/pdf2svg/dist/domstubs.js" {
  export function setStubs(namespace: object): void;
  export function unsetStubs(namespace: object): void;
}

declare module "@postscriptum.app/pdf2svg/dist/serializer.js" {
  export function serializeSvgToStream(
    elem: unknown,
    writable: import("stream").Writable,
    options?: { floatPrecision?: number; inheritedFontsAttr?: boolean },
  ): Promise<void>;
}
