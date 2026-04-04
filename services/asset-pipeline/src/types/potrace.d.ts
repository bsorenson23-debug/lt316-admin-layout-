declare module "potrace" {
  export interface PotraceOptions {
    turdSize?: number;
    alphaMax?: number;
    optCurve?: boolean;
    optTolerance?: number;
    threshold?: number;
    blackOnWhite?: boolean;
    color?: string;
    background?: string;
    steps?: number;
  }

  export function trace(
    input: Buffer | string,
    options: PotraceOptions,
    callback: (error: Error | null, svg: string) => void,
  ): void;
}
