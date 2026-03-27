import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { access, constants } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

export interface LightBurnSvgPreprocessResult {
  svgText: string;
  engine: "inkscape" | "none";
  executablePath?: string;
  message?: string;
}

async function pathExists(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    access(path, constants.F_OK, (error) => resolve(!error));
  });
}

export async function findInkscapeExecutable(): Promise<string | null> {
  const candidates = [
    process.env.LT316_INKSCAPE_PATH,
    process.env.INKSCAPE_PATH,
    join(process.cwd(), ".tools", "inkscape", "PFiles64", "Inkscape", "bin", "inkscape.exe"),
    join(process.cwd(), ".tools", "inkscape", "Inkscape", "bin", "inkscape.exe"),
    "C:\\Program Files\\Inkscape\\bin\\inkscape.exe",
    "C:\\Program Files\\Inkscape\\inkscape.exe",
    "C:\\Program Files (x86)\\Inkscape\\inkscape.exe",
  ].filter((value): value is string => Boolean(value && value.trim()));

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function preprocessSvgForLightBurn(svgText: string): Promise<LightBurnSvgPreprocessResult> {
  const inkscapePath = await findInkscapeExecutable();
  if (!inkscapePath) {
    return {
      svgText,
      engine: "none",
      message: "Inkscape not found; using original SVG.",
    };
  }

  const tempDir = await mkdtemp(join(tmpdir(), "lt316-inkscape-"));
  const inputPath = join(tempDir, "input.svg");
  const outputPath = join(tempDir, "output.svg");

  try {
    await writeFile(inputPath, svgText, "utf-8");
    await execFileAsync(inkscapePath, [
      inputPath,
      "--export-type=svg",
      `--export-filename=${outputPath}`,
      "--export-plain-svg",
      "--export-text-to-path",
      "--vacuum-defs",
    ]);
    const cleaned = await readFile(outputPath, "utf-8");
    return {
      svgText: cleaned,
      engine: "inkscape",
      executablePath: inkscapePath,
      message: `Preprocessed with ${basename(inkscapePath)}.`,
    };
  } catch (error) {
    return {
      svgText,
      engine: "none",
      executablePath: inkscapePath,
      message: error instanceof Error ? error.message : "Inkscape preprocessing failed; using original SVG.",
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
