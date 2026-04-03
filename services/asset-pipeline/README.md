# Asset Pipeline Service

This service is a Docker-isolated pipeline backend for staged asset processing.
It is intentionally separate from the main app so pipeline jobs, storage, and runtime concerns can evolve independently.

## Current Scope

Stage pipeline:
1. lookup
2. image-doctor
3. vectorize
4. mesh

- `lookup` remains scaffold-oriented
- `image-doctor` now performs real local raster cleanup with `sharp`
- `vectorize` and `mesh` remain scaffold stages

## Routes

- GET /
- GET /health
- POST /jobs
- GET /jobs/:id
- PUT /jobs/:id/raw-image
- POST /jobs/:id/lookup
- POST /jobs/:id/image-doctor
- POST /jobs/:id/text-detect
- POST /jobs/:id/vectorize
- POST /jobs/:id/mesh
- GET /storage/:jobId/*

`GET /` serves a small internal browser test UI for the pipeline service. It lets you create a job, upload one raw image, run image-doctor, preview the generated artifacts, and run approximate text detection/replacement setup without using the main app. The page also accepts pasted clipboard images, so you do not have to save a file locally first.

### POST /jobs request body

`POST /jobs` accepts an optional JSON body:

```json
{
  "input": "product url or product name",
  "categoryHint": "flat"
}
```

- `input` is stored in `manifest.product.input`
- `categoryHint` must be one of `flat`, `tumbler`, `mug`, `bottle`
- `categoryHint` is stored in `manifest.product.category`

## Job Storage

Storage root is:
- process.env.JOB_STORAGE_ROOT
- fallback: /data/jobs

Job ids are validated before any filesystem access. The service only resolves
paths beneath the configured storage root and rejects malformed or traversal-style
job ids with a 400 response.

Per-job layout:

- {JOB_STORAGE_ROOT}/{jobId}/manifest.json
- {JOB_STORAGE_ROOT}/{jobId}/product.json
- {JOB_STORAGE_ROOT}/{jobId}/images/raw/
- {JOB_STORAGE_ROOT}/{jobId}/images/clean/
- {JOB_STORAGE_ROOT}/{jobId}/images/clean/subject-transparent.png
- {JOB_STORAGE_ROOT}/{jobId}/images/clean/subject-clean.png
- {JOB_STORAGE_ROOT}/{jobId}/images/clean/vector-input.png
- {JOB_STORAGE_ROOT}/{jobId}/images/clean/silhouette-mask.png
- {JOB_STORAGE_ROOT}/{jobId}/images/clean/preview.jpg
- {JOB_STORAGE_ROOT}/{jobId}/debug/lookup.json
- {JOB_STORAGE_ROOT}/{jobId}/debug/doctor.json
- {JOB_STORAGE_ROOT}/{jobId}/debug/vectorize.json
- {JOB_STORAGE_ROOT}/{jobId}/debug/mesh.json

Section B writes the following inspectable files:

- `POST /jobs/:id/lookup`
  - updates `manifest.status` to `lookup`
  - writes `{jobId}/product.json`
  - writes `{jobId}/debug/lookup.json`
  - returns `{ manifest, product }`

- `POST /jobs/:id/image-doctor`
  - reads the first supported raster from `{jobId}/images/raw`
  - supports `.png`, `.jpg`, `.jpeg`, and `.webp`
  - auto-rotates from metadata, trims visible content, adds consistent padding, and writes real clean artifacts
  - accepts optional `vectorSettings` and `silhouetteSettings` in the JSON body for tuning `vector-input.png` and `silhouette-mask.png` independently
  - writes:
    - `{jobId}/images/clean/subject-transparent.png`
    - `{jobId}/images/clean/subject-clean.png`
    - `{jobId}/images/clean/vector-input.png`
    - `{jobId}/images/clean/silhouette-mask.png`
    - `{jobId}/images/clean/preview.jpg`
    - `{jobId}/debug/doctor.json`
  - updates `manifest.images.clean` with explicit artifact paths
  - returns `{ manifest, doctor }`

- `POST /jobs/:id/text-detect`
  - analyzes one job image with the internal browser UI text replacement tool
  - accepts `{ "source": "preview" | "subject-clean" | "subject-transparent" | "raw" }`
  - uses `ANTHROPIC_API_KEY` when configured
  - writes `{jobId}/debug/text-detect.json`
  - returns approximate text, font candidates, estimated size, angle, color, and notes

- `PUT /jobs/:id/raw-image`
  - accepts one raw request body upload from the browser test UI
  - requires a `filename` query parameter or `x-filename` header
  - replaces previous supported raw images for deterministic v1 behavior

- `GET /storage/:jobId/*`
  - serves raw, clean, and debug artifacts for browser inspection

### Supplying a raw image

1. Create a job with `POST /jobs`
2. Place one source image into:
   - `{JOB_STORAGE_ROOT}/{jobId}/images/raw`
3. Call `POST /jobs/:id/image-doctor`

For v1, image-doctor processes the first supported file found in `images/raw`.

### Image-doctor outputs

- `subject-transparent.png`
  - trimmed subject with transparency and padding
- `subject-clean.png`
  - the same subject flattened onto white
- `vector-input.png`
  - high-contrast raster intended to feed the future vectorize stage
- `silhouette-mask.png`
  - silhouette-style mask output
- `preview.jpg`
  - smaller preview for human inspection

`vector-input.png` is the output intended for the future vectorize stage.
The browser test UI exposes separate tuning controls for `vector-input.png` and `silhouette-mask.png`, so you can keep a cleaner silhouette while pushing more or less detail into the vector prep image without re-uploading the raw source.
The same UI also exposes a text detection panel for approximate font/style matching and a replacement SVG preview/download tool. That panel is intended for operator-assisted cleanup, not exact OCR-grade typography reconstruction.

Background cleanup in v1 is optimized for clean white or near-white backgrounds.
Busy or dark backgrounds may skip cleanup and preserve more of the original image.

Route error behavior:
- malformed job id or out-of-scope path attempt -> 400
- missing or unsupported raw image for image-doctor -> 400
- missing job manifest -> 404
- other service failures -> 500

## Why Separate From The App

- Isolates pipeline runtime and dependencies from the UI/admin app
- Keeps staged processing contracts stable while internals change
- Allows independent scaling/deployment and safer experimentation
