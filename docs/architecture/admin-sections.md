# Admin Sections

## Goals

- Give every admin section a stable owner and section ID.
- Keep one source of truth per section.
- Make runtime debug state line up with rendered DOM sections.

## Section map

| Section ID | Owner | Source of truth |
| --- | --- | --- |
| `template.source` | `template-editor` | `TemplateCreateForm` guided source state |
| `template.detect` | `template-editor` | staged detect result in `TemplateCreateForm` |
| `template.review` | `template-editor` | accepted/staged review state in `TemplateCreateForm` |
| `workspace.placement` | `workspace` | derived workspace geometry in `AdminLayoutShell` |
| `workspace.preview` | `preview` | effective preview mode from `Model3DPanel` |
| `job.readiness` | `job-readiness` | readiness selectors in `AdminLayoutShell` |
| `export.bundle` | `job-readiness` | export state in `TumblerExportPanel` |

## Rules

1. Every section gets a stable `data-section-id`, owner, and test ID.
2. Advanced diagnostics stay in the debug drawer or advanced drawers, not inline in operator summaries.
3. Cross-feature reads happen through feature entrypoints or shared primitives only.
4. Derived truth is not copied into local state unless the state represents an operator draft.

## Trace envelope

The admin shell builds one `AdminTraceEnvelope` with:

- `traceId`
- `runId`
- `sectionId`
- `templateId`
- `selectedItemId`
- source fingerprints
- authority label
- warnings / errors

This envelope is the bridge between runtime UI, diagnostics, and export history metadata.
