export function renderHomePage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Asset Pipeline Test UI</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f7fb;
        --panel: #ffffff;
        --border: #d8dee8;
        --text: #111827;
        --muted: #5b6472;
        --accent: #0f62fe;
        --accent-dark: #0a4bd1;
        --success: #0f9d58;
        --error: #c62828;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, #dfe9ff 0, transparent 28rem),
          linear-gradient(180deg, #f9fbff 0, var(--bg) 100%);
      }

      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 2rem 1.25rem 3rem;
      }

      h1 {
        margin: 0 0 0.5rem;
        font-size: 2rem;
      }

      p {
        margin: 0;
        color: var(--muted);
      }

      .grid {
        display: grid;
        grid-template-columns: 340px minmax(0, 1fr);
        gap: 1rem;
        margin-top: 1.5rem;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 1rem;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
      }

      .panel h2 {
        margin: 0 0 0.75rem;
        font-size: 1rem;
      }

      .stack {
        display: grid;
        gap: 0.75rem;
      }

      label {
        display: grid;
        gap: 0.35rem;
        font-size: 0.92rem;
        color: var(--muted);
      }

      input[type="text"],
      select,
      input[type="file"] {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.72rem 0.8rem;
        font: inherit;
        background: #fff;
        color: var(--text);
      }

      button {
        border: 0;
        border-radius: 10px;
        padding: 0.8rem 0.95rem;
        font: inherit;
        font-weight: 600;
        color: #fff;
        background: var(--accent);
        cursor: pointer;
      }

      button:hover {
        background: var(--accent-dark);
      }

      button.secondary {
        background: #1f2937;
      }

      button.secondary:hover {
        background: #111827;
      }

      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .status {
        min-height: 1.5rem;
        font-size: 0.92rem;
        font-weight: 600;
      }

      .status.success {
        color: var(--success);
      }

      .status.error {
        color: var(--error);
      }

      .job-id {
        padding: 0.75rem;
        border: 1px dashed var(--border);
        border-radius: 10px;
        background: #f8fbff;
        word-break: break-all;
      }

      .artifact-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 0.9rem;
      }

      .artifact-card {
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 0.75rem;
        background: #fbfcfe;
      }

      .artifact-card h3 {
        margin: 0 0 0.5rem;
        font-size: 0.95rem;
      }

      .artifact-card img {
        width: 100%;
        display: block;
        border-radius: 10px;
        border: 1px solid var(--border);
        background:
          linear-gradient(45deg, #eef2f8 25%, transparent 25%),
          linear-gradient(-45deg, #eef2f8 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #eef2f8 75%),
          linear-gradient(-45deg, transparent 75%, #eef2f8 75%);
        background-size: 16px 16px;
        background-position: 0 0, 0 8px, 8px -8px, -8px 0;
      }

      .artifact-card a {
        display: inline-block;
        margin-top: 0.5rem;
        color: var(--accent);
        text-decoration: none;
      }

      pre {
        margin: 0;
        padding: 0.9rem;
        border-radius: 12px;
        background: #0f172a;
        color: #d7e3ff;
        overflow: auto;
        max-height: 340px;
        font-size: 0.84rem;
      }

      .meta {
        display: grid;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }

      .meta strong {
        color: var(--text);
      }

      @media (max-width: 900px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Asset Pipeline Test UI</h1>
      <p>Create a job, upload one raw image, run image-doctor, and inspect the generated artifacts in the browser.</p>

      <div class="grid">
        <section class="panel stack">
          <h2>Controls</h2>

          <label>
            Product input
            <input id="job-input" type="text" placeholder="Optional product name or URL" />
          </label>

          <label>
            Category hint
            <select id="job-category">
              <option value="">None</option>
              <option value="flat">flat</option>
              <option value="tumbler">tumbler</option>
              <option value="mug">mug</option>
              <option value="bottle">bottle</option>
            </select>
          </label>

          <button id="create-job">Create job</button>

          <div class="job-id">
            <strong>Current job:</strong>
            <div id="job-id">No job selected</div>
          </div>

          <label>
            Raw image
            <input id="raw-image" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" />
          </label>

          <div
            id="paste-zone"
            tabindex="0"
            style="border:1px dashed var(--border); border-radius:12px; padding:0.9rem; background:#f8fbff; color:var(--muted);"
          >
            Paste an image here with <strong>Ctrl+V</strong> or <strong>Cmd+V</strong>.
          </div>

          <div class="job-id">
            <strong>Selected image:</strong>
            <div id="selected-image">None</div>
          </div>

          <div class="job-id" style="display:grid; gap:0.65rem;">
            <strong>Vector input tuning</strong>

            <label>
              Detail preset
              <select id="detail-preset">
                <option value="soft">Soft</option>
                <option value="balanced" selected>Balanced</option>
                <option value="fine">Fine</option>
              </select>
            </label>

            <label>
              Detail threshold
              <input id="threshold" type="range" min="80" max="240" value="176" />
              <span id="threshold-value">176</span>
            </label>

            <label>
              Contrast
              <input id="contrast" type="range" min="50" max="220" value="115" />
              <span id="contrast-value">1.15</span>
            </label>

            <label>
              Brightness offset
              <input id="brightness-offset" type="range" min="-80" max="80" value="-12" />
              <span id="brightness-offset-value">-12</span>
            </label>

            <label>
              Sharpen
              <input id="sharpen-sigma" type="range" min="0" max="30" value="11" />
              <span id="sharpen-sigma-value">1.10</span>
            </label>
          </div>

          <div class="job-id" style="display:grid; gap:0.65rem;">
            <strong>Silhouette mask tuning</strong>

            <label>
              Detail preset
              <select id="silhouette-preset">
                <option value="tight">Tight</option>
                <option value="balanced" selected>Balanced</option>
                <option value="bold">Bold</option>
              </select>
            </label>

            <label>
              Alpha threshold
              <input id="silhouette-threshold" type="range" min="1" max="255" value="24" />
              <span id="silhouette-threshold-value">24</span>
            </label>

            <label>
              Edge grow / shrink
              <input id="silhouette-grow" type="range" min="-6" max="6" value="0" />
              <span id="silhouette-grow-value">0</span>
            </label>

            <label>
              Edge blur
              <input id="silhouette-blur" type="range" min="0" max="30" value="0" />
              <span id="silhouette-blur-value">0.00</span>
            </label>
          </div>

          <button id="upload-raw" class="secondary" disabled>Upload raw image</button>
          <button id="run-doctor" disabled>Run image-doctor</button>
          <button id="refresh-job" class="secondary" disabled>Refresh job</button>

          <div id="status" class="status"></div>
        </section>

        <section class="panel">
          <div class="meta">
            <div><strong>Raw image:</strong> <span id="raw-path">None</span></div>
            <div><strong>Vector input:</strong> <span id="vector-path">Not generated</span></div>
          </div>

          <div id="artifact-grid" class="artifact-grid"></div>

          <h2 style="margin-top: 1rem;">Debug</h2>
          <pre id="debug-output">No debug data yet.</pre>
        </section>
      </div>
    </main>

    <script>
      const state = {
        jobId: null,
        pastedFile: null,
      };

      const el = {
        jobInput: document.getElementById('job-input'),
        jobCategory: document.getElementById('job-category'),
        createJob: document.getElementById('create-job'),
        jobId: document.getElementById('job-id'),
        rawImage: document.getElementById('raw-image'),
        pasteZone: document.getElementById('paste-zone'),
        selectedImage: document.getElementById('selected-image'),
        detailPreset: document.getElementById('detail-preset'),
        threshold: document.getElementById('threshold'),
        thresholdValue: document.getElementById('threshold-value'),
        contrast: document.getElementById('contrast'),
        contrastValue: document.getElementById('contrast-value'),
        brightnessOffset: document.getElementById('brightness-offset'),
        brightnessOffsetValue: document.getElementById('brightness-offset-value'),
        sharpenSigma: document.getElementById('sharpen-sigma'),
        sharpenSigmaValue: document.getElementById('sharpen-sigma-value'),
        silhouettePreset: document.getElementById('silhouette-preset'),
        silhouetteThreshold: document.getElementById('silhouette-threshold'),
        silhouetteThresholdValue: document.getElementById('silhouette-threshold-value'),
        silhouetteGrow: document.getElementById('silhouette-grow'),
        silhouetteGrowValue: document.getElementById('silhouette-grow-value'),
        silhouetteBlur: document.getElementById('silhouette-blur'),
        silhouetteBlurValue: document.getElementById('silhouette-blur-value'),
        uploadRaw: document.getElementById('upload-raw'),
        runDoctor: document.getElementById('run-doctor'),
        refreshJob: document.getElementById('refresh-job'),
        status: document.getElementById('status'),
        rawPath: document.getElementById('raw-path'),
        vectorPath: document.getElementById('vector-path'),
        artifactGrid: document.getElementById('artifact-grid'),
        debugOutput: document.getElementById('debug-output'),
      };

      function setStatus(message, tone) {
        el.status.textContent = message || '';
        el.status.className = 'status' + (tone ? ' ' + tone : '');
      }

      function setJobId(jobId) {
        state.jobId = jobId;
        el.jobId.textContent = jobId || 'No job selected';
        const enabled = Boolean(jobId);
        el.uploadRaw.disabled = !enabled;
        el.runDoctor.disabled = !enabled;
        el.refreshJob.disabled = !enabled;
      }

      function extensionForMimeType(type) {
        switch (type) {
          case 'image/png':
            return '.png';
          case 'image/jpeg':
            return '.jpg';
          case 'image/webp':
            return '.webp';
          default:
            return '.png';
        }
      }

      function presetValues(preset) {
        switch (preset) {
          case 'soft':
            return { threshold: 190, contrast: 1.0, brightnessOffset: -6, sharpenSigma: 0.4 };
          case 'fine':
            return { threshold: 156, contrast: 1.28, brightnessOffset: -18, sharpenSigma: 1.7 };
          default:
            return { threshold: 176, contrast: 1.15, brightnessOffset: -12, sharpenSigma: 1.1 };
        }
      }

      function syncVectorControlLabels() {
        el.thresholdValue.textContent = String(el.threshold.value);
        el.contrastValue.textContent = (Number(el.contrast.value) / 100).toFixed(2);
        el.brightnessOffsetValue.textContent = String(el.brightnessOffset.value);
        el.sharpenSigmaValue.textContent = (Number(el.sharpenSigma.value) / 10).toFixed(2);
      }

      function applyPreset(preset) {
        const values = presetValues(preset);
        el.threshold.value = String(values.threshold);
        el.contrast.value = String(Math.round(values.contrast * 100));
        el.brightnessOffset.value = String(values.brightnessOffset);
        el.sharpenSigma.value = String(Math.round(values.sharpenSigma * 10));
        syncVectorControlLabels();
      }

      function currentVectorSettings() {
        return {
          detailPreset: el.detailPreset.value,
          threshold: Number(el.threshold.value),
          contrast: Number(el.contrast.value) / 100,
          brightnessOffset: Number(el.brightnessOffset.value),
          sharpenSigma: Number(el.sharpenSigma.value) / 10,
        };
      }

      function silhouettePresetValues(preset) {
        switch (preset) {
          case 'tight':
            return { alphaThreshold: 48, edgeGrow: -1, blurSigma: 0 };
          case 'bold':
            return { alphaThreshold: 12, edgeGrow: 2, blurSigma: 0.8 };
          default:
            return { alphaThreshold: 24, edgeGrow: 0, blurSigma: 0 };
        }
      }

      function syncSilhouetteControlLabels() {
        el.silhouetteThresholdValue.textContent = String(el.silhouetteThreshold.value);
        el.silhouetteGrowValue.textContent = String(el.silhouetteGrow.value);
        el.silhouetteBlurValue.textContent = (Number(el.silhouetteBlur.value) / 10).toFixed(2);
      }

      function applySilhouettePreset(preset) {
        const values = silhouettePresetValues(preset);
        el.silhouetteThreshold.value = String(values.alphaThreshold);
        el.silhouetteGrow.value = String(values.edgeGrow);
        el.silhouetteBlur.value = String(Math.round(values.blurSigma * 10));
        syncSilhouetteControlLabels();
      }

      function currentSilhouetteSettings() {
        return {
          detailPreset: el.silhouettePreset.value,
          alphaThreshold: Number(el.silhouetteThreshold.value),
          edgeGrow: Number(el.silhouetteGrow.value),
          blurSigma: Number(el.silhouetteBlur.value) / 10,
        };
      }

      function getSelectedFile() {
        return state.pastedFile || (el.rawImage.files && el.rawImage.files[0]) || null;
      }

      function updateSelectedImageLabel() {
        const file = getSelectedFile();
        if (!file) {
          el.selectedImage.textContent = 'None';
          return;
        }

        const sizeKb = Math.max(1, Math.round(file.size / 1024));
        el.selectedImage.textContent = file.name + ' (' + sizeKb + ' KB)';
      }

      function setPastedFile(file) {
        state.pastedFile = file;
        el.rawImage.value = '';
        updateSelectedImageLabel();
        setStatus('Clipboard image ready to upload.', 'success');
      }

      function clearPastedFile() {
        state.pastedFile = null;
        updateSelectedImageLabel();
      }

      function readClipboardImage(event) {
        const items = event.clipboardData && event.clipboardData.items;
        if (!items) return false;

        for (const item of items) {
          if (!item.type || !item.type.startsWith('image/')) continue;
          const blob = item.getAsFile();
          if (!blob) continue;

          const extension = extensionForMimeType(blob.type);
          const file = new File([blob], 'clipboard-image' + extension, {
            type: blob.type || 'image/png',
          });
          setPastedFile(file);
          return true;
        }

        return false;
      }

      function fileUrl(storagePath) {
        if (!storagePath) return null;
        return '/storage/' + storagePath.split('/').map(encodeURIComponent).join('/');
      }

      function renderArtifacts(manifest) {
        const clean = manifest?.images?.clean || {};
        const raw = manifest?.images?.raw || [];

        el.rawPath.textContent = raw[0] || 'None';
        el.vectorPath.textContent = clean.vectorInput || 'Not generated';
        el.artifactGrid.innerHTML = '';

        const artifacts = [
          ['subjectTransparent', 'Subject transparent', true],
          ['subjectClean', 'Subject clean', true],
          ['vectorInput', 'Vector input', true],
          ['silhouetteMask', 'Silhouette mask', true],
          ['preview', 'Preview JPG', true],
        ];

        for (const [key, label, isImage] of artifacts) {
          if (!clean[key]) continue;

          const card = document.createElement('article');
          card.className = 'artifact-card';
          const title = document.createElement('h3');
          title.textContent = label;
          card.appendChild(title);

          const url = fileUrl(clean[key]);
          if (isImage && url) {
            const image = document.createElement('img');
            image.src = url + '?v=' + Date.now();
            image.alt = label;
            card.appendChild(image);
          }

          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.textContent = clean[key];
          card.appendChild(link);

          el.artifactGrid.appendChild(card);
        }
      }

      async function refreshJob() {
        if (!state.jobId) return;

        const manifest = await fetch('/jobs/' + encodeURIComponent(state.jobId)).then((response) => {
          if (!response.ok) throw new Error('Failed to load job.');
          return response.json();
        });

        renderArtifacts(manifest);
        const debugJson = manifest?.debug?.doctor || null;
        el.debugOutput.textContent = debugJson
          ? JSON.stringify(debugJson, null, 2)
          : 'No debug data yet.';
      }

      async function createJob() {
        setStatus('Creating job...', '');

        const payload = {};
        if (el.jobInput.value.trim()) payload.input = el.jobInput.value.trim();
        if (el.jobCategory.value) payload.categoryHint = el.jobCategory.value;

        const response = await fetch('/jobs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.detail || json.error || 'Failed to create job.');
        }

        setJobId(json.jobId);
        await refreshJob();
        setStatus('Job created.', 'success');
      }

      async function uploadRaw() {
        if (!state.jobId) throw new Error('Create a job first.');
        const file = getSelectedFile();
        if (!file) throw new Error('Choose one image file first.');

        setStatus('Uploading raw image...', '');

        const response = await fetch(
          '/jobs/' + encodeURIComponent(state.jobId) + '/raw-image?filename=' + encodeURIComponent(file.name),
          {
            method: 'PUT',
            headers: {
              'content-type': file.type || 'application/octet-stream',
            },
            body: file,
          },
        );

        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.detail || json.error || 'Failed to upload raw image.');
        }

        await refreshJob();
        setStatus('Raw image uploaded.', 'success');
      }

      async function runDoctor() {
        if (!state.jobId) throw new Error('Create a job first.');

        setStatus('Running image-doctor...', '');
        const response = await fetch('/jobs/' + encodeURIComponent(state.jobId) + '/image-doctor', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            vectorSettings: currentVectorSettings(),
            silhouetteSettings: currentSilhouetteSettings(),
          }),
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.detail || json.error || 'Image-doctor failed.');
        }

        renderArtifacts(json.manifest);
        await refreshJob();
        setStatus('Image-doctor completed.', 'success');
      }

      el.createJob.addEventListener('click', () => {
        createJob().catch((error) => setStatus(error.message || 'Create job failed.', 'error'));
      });

      el.rawImage.addEventListener('change', () => {
        clearPastedFile();
        updateSelectedImageLabel();
      });

      el.pasteZone.addEventListener('paste', (event) => {
        if (readClipboardImage(event)) {
          event.preventDefault();
        }
      });

      window.addEventListener('paste', (event) => {
        const activeTag = document.activeElement && document.activeElement.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
          return;
        }

        if (readClipboardImage(event)) {
          event.preventDefault();
        }
      });

      el.uploadRaw.addEventListener('click', () => {
        uploadRaw().catch((error) => setStatus(error.message || 'Upload failed.', 'error'));
      });

      el.runDoctor.addEventListener('click', () => {
        runDoctor().catch((error) => setStatus(error.message || 'Image-doctor failed.', 'error'));
      });

      el.refreshJob.addEventListener('click', () => {
        refreshJob()
          .then(() => setStatus('Job refreshed.', 'success'))
          .catch((error) => setStatus(error.message || 'Refresh failed.', 'error'));
      });

      el.detailPreset.addEventListener('change', () => {
        applyPreset(el.detailPreset.value);
      });

      el.silhouettePreset.addEventListener('change', () => {
        applySilhouettePreset(el.silhouettePreset.value);
      });

      [el.threshold, el.contrast, el.brightnessOffset, el.sharpenSigma].forEach((input) => {
        input.addEventListener('input', syncVectorControlLabels);
      });

      [el.silhouetteThreshold, el.silhouetteGrow, el.silhouetteBlur].forEach((input) => {
        input.addEventListener('input', syncSilhouetteControlLabels);
      });

      applyPreset(el.detailPreset.value);
      applySilhouettePreset(el.silhouettePreset.value);
      updateSelectedImageLabel();
    </script>
  </body>
</html>`;
}
