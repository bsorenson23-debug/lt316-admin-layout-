function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function inferFlatFamilyKey(args: {
  familyKey?: string | null;
  glbPath?: string | null;
  label?: string | null;
}): string {
  if (args.familyKey?.trim()) return args.familyKey.trim();

  const text = `${args.glbPath ?? ""} ${args.label ?? ""}`.toLowerCase();

  if (hasAny(text, [/\bmagazine\b/, /\bpmag\b/, /\bstanag\b/, /\bglock\b/])) {
    return "magazine";
  }
  if (hasAny(text, [/\bknife\b/, /\bblade\b/, /\bblank\b/])) {
    return "knife-blank";
  }
  if (hasAny(text, [/\bdog[ -]?tag\b/, /\bmilitary tag\b/])) {
    return "dog-tag";
  }
  if (hasAny(text, [/\bkeychain\b/, /\bkey tag\b/, /\bkey ring\b/])) {
    return "keychain";
  }
  if (hasAny(text, [/\bphone case\b/, /\biphone case\b/, /\bgalaxy case\b/])) {
    return "phone-case";
  }
  if (hasAny(text, [/\bbusiness card\b/, /\bwallet card\b/, /\bmetal card\b/])) {
    return "card";
  }
  if (hasAny(text, [/\bcoaster\b/, /\bround plate\b/, /\bdisc\b/, /\bround\b/])) {
    return "round-plate";
  }

  return "rect-plate";
}
