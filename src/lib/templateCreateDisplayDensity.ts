export interface TemplateCreateDisplayMessage {
  level: "error" | "warning";
  message: string;
}

export function dedupeTemplateCreateDisplayMessages(
  messages: readonly (TemplateCreateDisplayMessage | null | undefined)[],
): TemplateCreateDisplayMessage[] {
  const ordered: TemplateCreateDisplayMessage[] = [];
  const seen = new Set<string>();

  for (const entry of messages) {
    const message = entry?.message?.trim();
    if (!message) continue;
    const level = entry?.level === "error" ? "error" : "warning";
    const key = `${level}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({ level, message });
  }

  return ordered;
}

export function shouldAutoOpenTemplateCreateDiagnostics(args: {
  adminDebugEnabled: boolean;
  routeDebugEnabled?: boolean;
}): boolean {
  return args.adminDebugEnabled || Boolean(args.routeDebugEnabled);
}

export function shouldShowTemplateCreateDiagnostics(args: {
  adminDebugEnabled: boolean;
  routeDebugEnabled?: boolean;
}): boolean {
  return shouldAutoOpenTemplateCreateDiagnostics(args);
}
