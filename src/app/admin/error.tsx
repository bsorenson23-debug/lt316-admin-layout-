"use client";

import React from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminErrorBoundary({ error, reset }: Props) {
  return (
    <div style={{ padding: 24, display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Admin surface failed</h2>
      <p style={{ margin: 0 }}>
        The admin route hit a rendering error. Use the debug drawer or console trace to inspect the failing section.
      </p>
      <pre
        style={{
          margin: 0,
          padding: 12,
          overflowX: "auto",
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {error.message}
        {error.digest ? `\nDigest: ${error.digest}` : ""}
      </pre>
      <div>
        <button type="button" onClick={reset}>
          Retry admin route
        </button>
      </div>
    </div>
  );
}
