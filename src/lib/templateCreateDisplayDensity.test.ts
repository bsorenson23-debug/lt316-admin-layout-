import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeTemplateCreateDisplayMessages,
  shouldAutoOpenTemplateCreateDiagnostics,
  shouldShowTemplateCreateDiagnostics,
} from "./templateCreateDisplayDensity.ts";

test("dedupeTemplateCreateDisplayMessages keeps first-seen severity and removes duplicates", () => {
  const messages = dedupeTemplateCreateDisplayMessages([
    { level: "warning", message: " Saved placement is stale. " },
    { level: "warning", message: "Saved placement is stale." },
    { level: "error", message: "Overlay extends outside printable area." },
    { level: "error", message: "Overlay extends outside printable area." },
    null,
    undefined,
  ]);

  assert.deepEqual(messages, [
    { level: "warning", message: "Saved placement is stale." },
    { level: "error", message: "Overlay extends outside printable area." },
  ]);
});

test("shouldAutoOpenTemplateCreateDiagnostics keeps debug details collapsed by default", () => {
  assert.equal(
    shouldAutoOpenTemplateCreateDiagnostics({
      adminDebugEnabled: true,
      routeDebugEnabled: false,
    }),
    false,
  );
  assert.equal(
    shouldAutoOpenTemplateCreateDiagnostics({
      adminDebugEnabled: false,
      routeDebugEnabled: true,
    }),
    false,
  );
  assert.equal(
    shouldAutoOpenTemplateCreateDiagnostics({
      adminDebugEnabled: false,
      routeDebugEnabled: false,
    }),
    false,
  );
});

test("shouldShowTemplateCreateDiagnostics keeps normal mode clean", () => {
  assert.equal(
    shouldShowTemplateCreateDiagnostics({
      adminDebugEnabled: false,
      routeDebugEnabled: false,
    }),
    false,
  );
  assert.equal(
    shouldShowTemplateCreateDiagnostics({
      adminDebugEnabled: false,
      routeDebugEnabled: true,
    }),
    true,
  );
  assert.equal(
    shouldShowTemplateCreateDiagnostics({
      adminDebugEnabled: true,
      routeDebugEnabled: false,
    }),
    true,
  );
});
