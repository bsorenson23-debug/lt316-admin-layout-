import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeTemplateCreateDisplayMessages,
  shouldAutoOpenTemplateCreateDiagnostics,
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

test("shouldAutoOpenTemplateCreateDiagnostics follows debug mode", () => {
  assert.equal(
    shouldAutoOpenTemplateCreateDiagnostics({
      adminDebugEnabled: true,
      routeDebugEnabled: false,
    }),
    true,
  );
  assert.equal(
    shouldAutoOpenTemplateCreateDiagnostics({
      adminDebugEnabled: false,
      routeDebugEnabled: true,
    }),
    true,
  );
  assert.equal(
    shouldAutoOpenTemplateCreateDiagnostics({
      adminDebugEnabled: false,
      routeDebugEnabled: false,
    }),
    false,
  );
});
