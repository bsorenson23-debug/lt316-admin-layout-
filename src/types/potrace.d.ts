declare module "potrace" {
  export interface PotraceOptions {
    turnPolicy?: string;
    turdSize?: number;
    alphaMax?: number;
    optCurve?: boolean;
    optTolerance?: number;
    threshold?: number;
    blackOnWhite?: boolean;
    color?: string;
    background?: string;
  }

  export interface PosterizeOptions extends PotraceOptions {
    steps?: number | number[];
  }

  export function trace(
    file: Buffer,
    options: PotraceOptions,
    cb: (err: Error | null, svg: string) => void,
  ): void;

  export function posterize(
    file: Buffer,
    options: PosterizeOptions,
    cb: (err: Error | null, svg: string) => void,
  ): void;
}
