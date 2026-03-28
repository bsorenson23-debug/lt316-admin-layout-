# Asset Pipeline Service

This service is a Docker-isolated pipeline backend for staged asset processing.
It is intentionally separate from the main app so pipeline jobs, storage, and runtime concerns can evolve independently.

## Current Scope

Scaffold-only stage pipeline:
1. lookup
2. image-doctor
3. vectorize
4. mesh

No real image processing is implemented yet.

## Routes

- GET /health
- POST /jobs
- GET /jobs/:id
- POST /jobs/:id/lookup
- POST /jobs/:id/image-doctor
- POST /jobs/:id/vectorize
- POST /jobs/:id/mesh

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
- {JOB_STORAGE_ROOT}/{jobId}/images/clean/doctor-result.json
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
  - updates `manifest.status` to `image-doctor`
  - ensures `images/raw`, `images/clean`, and `debug` exist
  - writes `{jobId}/images/clean/doctor-result.json`
  - writes `{jobId}/debug/doctor.json`
  - updates `manifest.images.clean` and `manifest.images.views` with simple placeholder outputs
  - returns `{ manifest, doctor }`

Route error behavior:
- malformed job id or out-of-scope path attempt -> 400
- missing job manifest -> 404
- other service failures -> 500

## Why Separate From The App

- Isolates pipeline runtime and dependencies from the UI/admin app
- Keeps staged processing contracts stable while internals change
- Allows independent scaling/deployment and safer experimentation
