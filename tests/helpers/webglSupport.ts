import path from "path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { formatWebGlProbeFailure, probeWebGlSupport } from "../../scripts/playwrightWebgl.mjs";

const repoRoot = process.cwd();

export async function ensureWebGlSupport(
  page: Page,
  testInfo: TestInfo,
  label: string,
): Promise<void> {
  const result = await probeWebGlSupport(page, {
    label,
    diagnosticsFilePath: path.join(repoRoot, "tmp", "audit", `${label}.webgl.json`),
  });

  await testInfo.attach(`${label}-webgl`, {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });

  expect(result.ok, formatWebGlProbeFailure(result)).toBe(true);
}
