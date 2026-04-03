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
      textarea,
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

      textarea {
        min-height: 5.5rem;
        resize: vertical;
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

      .note {
        font-size: 0.88rem;
        line-height: 1.45;
        color: var(--muted);
      }

      .mini-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.7rem;
      }

      .preview-frame {
        min-height: 180px;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0.75rem;
        background:
          linear-gradient(45deg, #eef2f8 25%, transparent 25%),
          linear-gradient(-45deg, #eef2f8 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #eef2f8 75%),
          linear-gradient(-45deg, transparent 75%, #eef2f8 75%);
        background-size: 16px 16px;
        background-position: 0 0, 0 8px, 8px -8px, -8px 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .preview-frame img {
        max-width: 100%;
        max-height: 260px;
        display: block;
      }

      .summary-card {
        border: 1px dashed var(--border);
        border-radius: 12px;
        padding: 0.85rem;
        background: #f8fbff;
        display: grid;
        gap: 0.45rem;
      }

      .summary-card strong {
        color: var(--text);
      }

      .summary-row {
        display: grid;
        gap: 0.15rem;
      }

      .summary-label {
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
      }

      .summary-value {
        font-size: 0.92rem;
        color: var(--text);
        word-break: break-word;
      }

      .button-row {
        display: flex;
        gap: 0.65rem;
        flex-wrap: wrap;
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
      <p>Create a job, upload one raw image, reuse a temporary placeholder when needed, then inspect the generated artifacts in the browser.</p>

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
            <strong>Temporary placeholder</strong>
            <div id="placeholder-status">No placeholder saved.</div>
            <div class="button-row">
              <button id="save-placeholder" class="secondary" disabled>Save placeholder</button>
              <button id="use-placeholder" class="secondary" disabled>Use placeholder</button>
              <button id="create-job-from-placeholder" class="secondary" disabled>Create job from placeholder</button>
            </div>
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

          <div class="job-id" style="display:grid; gap:0.65rem;">
            <strong>Text detection</strong>
            <span class="note">Analyzes the current job image and seeds a replacement-style SVG editor. Font matching is approximate.</span>

            <label>
              Detection source
              <select id="text-source">
                <option value="preview" selected>Preview JPG</option>
                <option value="subject-clean">Subject clean</option>
                <option value="subject-transparent">Subject transparent</option>
                <option value="raw">Raw image</option>
              </select>
            </label>

            <button id="analyze-text" class="secondary" disabled>Analyze text</button>
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

          <h2 style="margin-top: 1rem;">Vector Doctor</h2>
          <div class="stack">
            <span class="note">Protected vector-prep inspector. This stage uses image-doctor outputs and grouped masks to preview logo-detail trace inputs without generating final SVG yet.</span>

            <div class="button-row">
              <button id="run-vector-doctor" class="secondary" disabled>Run vector-doctor</button>
            </div>

            <div id="vector-doctor-summary" class="summary-card">
              <div class="summary-row">
                <span class="summary-label">Vector doctor</span>
                <span class="summary-value">No vector-doctor run yet.</span>
              </div>
            </div>

            <div id="vector-doctor-artifacts" class="artifact-grid"></div>
          </div>

          <h2 style="margin-top: 1rem;">Vectorize</h2>
          <div class="stack">
            <span class="note">Builds layered SVG outputs from the vector-doctor branches. The generated files are written back into the job and can be opened directly.</span>

            <div class="button-row">
              <button id="run-vectorize" class="secondary" disabled>Run vectorize</button>
            </div>

            <div id="vectorize-summary" class="summary-card">
              <div class="summary-row">
                <span class="summary-label">Vectorize</span>
                <span class="summary-value">No vector SVG outputs yet.</span>
              </div>
            </div>

            <div id="vectorize-artifacts" class="artifact-grid"></div>
          </div>

          <h2 style="margin-top: 1rem;">Text Replacement</h2>
          <div class="stack">
            <div id="text-detect-output" class="summary-card">
              <div class="summary-row">
                <span class="summary-label">Detection</span>
                <span class="summary-value">No text analysis yet.</span>
              </div>
            </div>

            <div class="mini-grid">
              <label>
                Replacement mode
                <select id="replacement-mode">
                  <option value="auto" selected>Auto</option>
                  <option value="font-match">Best font match</option>
                  <option value="trace">Trace original lettering</option>
                </select>
              </label>

              <label>
                Replacement text
                <textarea id="replacement-text" placeholder="Detected text will populate here"></textarea>
              </label>

              <label>
                Font family
                <input id="replacement-font-family" type="text" list="font-candidates" placeholder="Approximate font match" />
                <datalist id="font-candidates"></datalist>
              </label>

              <label>
                Font size (px)
                <input id="replacement-font-size" type="number" min="8" max="400" value="72" />
              </label>

              <label>
                Angle (deg)
                <input id="replacement-angle" type="number" min="-180" max="180" step="0.5" value="0" />
              </label>

              <label>
                Letter spacing
                <input id="replacement-letter-spacing" type="number" min="-20" max="80" step="0.5" value="0" />
              </label>

              <label>
                Anchor
                <select id="replacement-anchor">
                  <option value="start" selected>Start</option>
                  <option value="middle">Middle</option>
                  <option value="end">End</option>
                </select>
              </label>

              <label>
                Weight
                <select id="replacement-weight">
                  <option value="normal" selected>Regular</option>
                  <option value="bold">Bold</option>
                </select>
              </label>

              <label>
                Style
                <select id="replacement-style">
                  <option value="normal" selected>Normal</option>
                  <option value="italic">Italic</option>
                </select>
              </label>
            </div>

            <label style="width:max-content;">
              Fill
              <input id="replacement-fill" type="color" value="#000000" style="width:64px; padding:0.2rem;" />
            </label>

            <div class="button-row">
              <button id="use-detected-text" class="secondary" disabled>Use detected text</button>
              <button id="generate-replacement" class="secondary" disabled>Generate replacement</button>
              <button id="download-replacement" disabled>Download replacement SVG</button>
            </div>

            <div id="replacement-result-summary" class="summary-card">
              <div class="summary-row">
                <span class="summary-label">Replacement</span>
                <span class="summary-value">No replacement generated yet.</span>
              </div>
            </div>

            <div class="preview-frame">
              <img id="replacement-preview" alt="Replacement SVG preview" style="display:none;" />
              <span id="replacement-preview-empty" class="note">Run text detection, choose a mode, then generate the replacement SVG.</span>
            </div>

            <pre id="replacement-svg-output">No replacement SVG yet.</pre>
          </div>

          <h2 style="margin-top: 1rem;">Debug</h2>
          <pre id="debug-output">No debug data yet.</pre>
        </section>
      </div>
    </main>

    <script>
      const state = {
        jobId: null,
        pastedFile: null,
        placeholder: null,
        hasRawImage: false,
        rerunTimer: null,
        manifest: null,
        textDetection: null,
        replacementDownloadUrl: null,
        replacementResult: null,
        vectorDoctor: null,
        vectorize: null,
      };

      const el = {
        jobInput: document.getElementById('job-input'),
        jobCategory: document.getElementById('job-category'),
        createJob: document.getElementById('create-job'),
        jobId: document.getElementById('job-id'),
        rawImage: document.getElementById('raw-image'),
        pasteZone: document.getElementById('paste-zone'),
        selectedImage: document.getElementById('selected-image'),
        placeholderStatus: document.getElementById('placeholder-status'),
        savePlaceholder: document.getElementById('save-placeholder'),
        usePlaceholder: document.getElementById('use-placeholder'),
        createJobFromPlaceholder: document.getElementById('create-job-from-placeholder'),
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
        textSource: document.getElementById('text-source'),
        analyzeText: document.getElementById('analyze-text'),
        uploadRaw: document.getElementById('upload-raw'),
        runDoctor: document.getElementById('run-doctor'),
        runVectorDoctor: document.getElementById('run-vector-doctor'),
        runVectorize: document.getElementById('run-vectorize'),
        refreshJob: document.getElementById('refresh-job'),
        status: document.getElementById('status'),
        rawPath: document.getElementById('raw-path'),
        vectorPath: document.getElementById('vector-path'),
        artifactGrid: document.getElementById('artifact-grid'),
        vectorDoctorSummary: document.getElementById('vector-doctor-summary'),
        vectorDoctorArtifacts: document.getElementById('vector-doctor-artifacts'),
        vectorizeSummary: document.getElementById('vectorize-summary'),
        vectorizeArtifacts: document.getElementById('vectorize-artifacts'),
        textDetectOutput: document.getElementById('text-detect-output'),
        replacementMode: document.getElementById('replacement-mode'),
        replacementText: document.getElementById('replacement-text'),
        replacementFontFamily: document.getElementById('replacement-font-family'),
        replacementFontSize: document.getElementById('replacement-font-size'),
        replacementAngle: document.getElementById('replacement-angle'),
        replacementLetterSpacing: document.getElementById('replacement-letter-spacing'),
        replacementAnchor: document.getElementById('replacement-anchor'),
        replacementWeight: document.getElementById('replacement-weight'),
        replacementStyle: document.getElementById('replacement-style'),
        replacementFill: document.getElementById('replacement-fill'),
        fontCandidates: document.getElementById('font-candidates'),
        useDetectedText: document.getElementById('use-detected-text'),
        generateReplacement: document.getElementById('generate-replacement'),
        downloadReplacement: document.getElementById('download-replacement'),
        replacementResultSummary: document.getElementById('replacement-result-summary'),
        replacementPreview: document.getElementById('replacement-preview'),
        replacementPreviewEmpty: document.getElementById('replacement-preview-empty'),
        replacementSvgOutput: document.getElementById('replacement-svg-output'),
        debugOutput: document.getElementById('debug-output'),
      };

      function setStatus(message, tone) {
        el.status.textContent = message || '';
        el.status.className = 'status' + (tone ? ' ' + tone : '');
      }

      function syncPlaceholderControls() {
        const hasSelectedFile = Boolean(getSelectedFile());
        const hasJobRaw = Boolean(state.jobId && state.hasRawImage);
        const hasPlaceholder = Boolean(state.placeholder && state.placeholder.exists);

        el.savePlaceholder.disabled = !(hasSelectedFile || hasJobRaw);
        el.usePlaceholder.disabled = !(state.jobId && hasPlaceholder);
        el.createJobFromPlaceholder.disabled = !hasPlaceholder;
      }

      function renderPlaceholderStatus() {
        if (!state.placeholder || !state.placeholder.exists) {
          el.placeholderStatus.textContent = 'No placeholder saved.';
          syncPlaceholderControls();
          return;
        }

        const sizeKb = Math.max(1, Math.round((state.placeholder.byteLength || 0) / 1024));
        const savedAt = state.placeholder.savedAt
          ? new Date(state.placeholder.savedAt).toLocaleString()
          : 'unknown time';
        el.placeholderStatus.textContent =
          state.placeholder.fileName + ' (' + sizeKb + ' KB) saved ' + savedAt;
        syncPlaceholderControls();
      }

      async function refreshPlaceholder() {
        const response = await fetch('/placeholder');
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.detail || json.error || 'Failed to load placeholder.');
        }

        state.placeholder = json;
        renderPlaceholderStatus();
      }

      function setJobId(jobId) {
        state.jobId = jobId;
        el.jobId.textContent = jobId || 'No job selected';
        const enabled = Boolean(jobId);
        el.uploadRaw.disabled = !enabled;
        el.runDoctor.disabled = !enabled;
        el.runVectorDoctor.disabled = !enabled;
        el.runVectorize.disabled = !enabled;
        el.refreshJob.disabled = !enabled;
        el.analyzeText.disabled = !enabled;
        el.generateReplacement.disabled = !enabled;
        syncPlaceholderControls();
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function escapeXml(value) {
        return escapeHtml(value)
          .replace(/&#39;/g, '&apos;');
      }

      function revokeReplacementUrl() {
        if (state.replacementDownloadUrl) {
          URL.revokeObjectURL(state.replacementDownloadUrl);
          state.replacementDownloadUrl = null;
        }
      }

      function normalizeColor(value) {
        return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value || '') ? value : '#000000';
      }

      function clearReplacementPreview(message) {
        revokeReplacementUrl();
        state.replacementResult = null;
        el.downloadReplacement.disabled = true;
        el.replacementPreview.removeAttribute('src');
        el.replacementPreview.style.display = 'none';
        el.replacementPreviewEmpty.style.display = 'inline';
        el.replacementSvgOutput.textContent = 'No replacement SVG yet.';
        el.replacementResultSummary.innerHTML =
          '<div class="summary-row"><span class="summary-label">Replacement</span><span class="summary-value">' +
          escapeHtml(message || 'No replacement generated yet.') +
          '</span></div>';
      }

      function markReplacementDirty(message) {
        if (!state.textDetection) {
          clearReplacementPreview('Run text detection first.');
          return;
        }

        clearReplacementPreview(message || 'Replacement settings changed. Generate replacement to refresh.');
      }

      function renderReplacementResult(payload) {
        const replacement = payload && payload.replacement ? payload.replacement : null;
        state.replacementResult = replacement;

        if (!replacement || !replacement.svg) {
          clearReplacementPreview('Replacement generation did not return an SVG.');
          return;
        }

        revokeReplacementUrl();
        state.replacementDownloadUrl = URL.createObjectURL(new Blob([replacement.svg], { type: 'image/svg+xml' }));
        el.downloadReplacement.disabled = false;
        el.replacementPreview.src = state.replacementDownloadUrl;
        el.replacementPreview.style.display = 'block';
        el.replacementPreviewEmpty.style.display = 'none';
        el.replacementSvgOutput.textContent = replacement.svg;

        const debug = replacement.debug || {};
        const chosenFont = debug.finalChosenFont || 'Original traced lettering';
        const confidencePct = Math.round((debug.confidenceScore || 0) * 100);
        const fallbackText = debug.fallbackReason
          ? '<div class="summary-row"><span class="summary-label">Fallback</span><span class="summary-value">' +
              escapeHtml(debug.fallbackReason) +
            '</span></div>'
          : '';
        el.replacementResultSummary.innerHTML =
          '<div class="summary-row"><span class="summary-label">Chosen mode</span><span class="summary-value">' + escapeHtml(replacement.mode || '') + '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Chosen font</span><span class="summary-value">' + escapeHtml(chosenFont) + '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Confidence</span><span class="summary-value">' + escapeHtml(String(confidencePct) + '%') + '</span></div>' +
          fallbackText;
      }

      function setReplacementEditorFromDetection(detection, useDetectedText) {
        if (!detection) return;

        if (useDetectedText && detection.text) {
          el.replacementText.value = detection.text;
        }
        el.replacementMode.value = detection.recommendedMode === 'trace' ? 'trace' : 'auto';
        el.replacementFontFamily.value =
          detection.fontFamily || (detection.fontCandidates && detection.fontCandidates[0]) || 'Arial';
        el.replacementFontSize.value = String(Math.max(8, Math.round(detection.estimatedFontSizePx || 72)));
        el.replacementAngle.value = String(Number(detection.angleDeg || 0).toFixed(1));
        el.replacementLetterSpacing.value = String(Number(detection.letterSpacing || 0).toFixed(1));
        el.replacementWeight.value =
          /bold|black|semi/i.test(detection.fontWeight || '') ? 'bold' : 'normal';
        el.replacementStyle.value = (detection.fontStyle || '').toLowerCase() === 'italic' ? 'italic' : 'normal';
        el.replacementFill.value = normalizeColor(detection.fill);
        clearReplacementPreview('Detection loaded. Generate replacement to preview the fitted SVG.');
      }

      function renderTextDetectionPanel(payload) {
        const detection = payload && payload.detection ? payload.detection : null;
        state.textDetection = detection;

        if (!detection) {
          el.textDetectOutput.innerHTML = '<div class="summary-row"><span class="summary-label">Detection</span><span class="summary-value">No text analysis yet.</span></div>';
          el.useDetectedText.disabled = true;
          return;
        }

        const candidates = Array.isArray(detection.fontCandidates) && detection.fontCandidates.length
          ? detection.fontCandidates
          : [];
        el.fontCandidates.innerHTML = '';
        candidates.forEach((candidate) => {
          const option = document.createElement('option');
          option.value = candidate;
          el.fontCandidates.appendChild(option);
        });

        const notesHtml = Array.isArray(detection.notes) && detection.notes.length
          ? '<div class="summary-row"><span class="summary-label">Notes</span><span class="summary-value">' +
              escapeHtml(detection.notes.join(' | ')) +
            '</span></div>'
          : '';

        el.textDetectOutput.innerHTML =
          '<div class="summary-row"><span class="summary-label">Source</span><span class="summary-value">' + escapeHtml(payload.sourcePath || payload.source || '') + '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Detected text</span><span class="summary-value">' + escapeHtml(detection.text || 'No text found') + '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Font guess</span><span class="summary-value">' + escapeHtml(detection.fontFamily || detection.fontCategory || 'Approximate') + '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Candidates</span><span class="summary-value">' + escapeHtml(candidates.join(', ') || 'None returned') + '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Size / angle</span><span class="summary-value">' + escapeHtml(String(detection.estimatedFontSizePx || '?') + ' px / ' + Number(detection.angleDeg || 0).toFixed(1) + ' deg') + '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Recommended mode</span><span class="summary-value">' + escapeHtml(detection.recommendedMode || 'auto') + '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Confidence</span><span class="summary-value">' + escapeHtml(String(Math.round((detection.confidence || 0) * 100)) + '% OCR / ' + String(Math.round((detection.fontMatchConfidence || 0) * 100)) + '% font match') + '</span></div>' +
          notesHtml;

        el.useDetectedText.disabled = !detection.text;
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
          syncPlaceholderControls();
          return;
        }

        const sizeKb = Math.max(1, Math.round(file.size / 1024));
        el.selectedImage.textContent = file.name + ' (' + sizeKb + ' KB)';
        syncPlaceholderControls();
      }

      function setPastedFile(file) {
        state.pastedFile = file;
        el.rawImage.value = '';
        updateSelectedImageLabel();
      }

      function clearPastedFile() {
        state.pastedFile = null;
        updateSelectedImageLabel();
      }

      async function handlePastedFile(file) {
        setPastedFile(file);

        if (!state.jobId) {
          setStatus('Clipboard image captured. Create a job, then upload it.', 'success');
          return true;
        }

        setStatus('Clipboard image captured. Uploading raw image...', '');

        try {
          await uploadRaw();
          setStatus('Clipboard image uploaded.', 'success');
          return true;
        } catch (error) {
          setStatus(error.message || 'Clipboard upload failed.', 'error');
          return false;
        }
      }

      function getClipboardImageFile(event) {
        const items = event.clipboardData && event.clipboardData.items;
        if (!items) return null;

        for (const item of items) {
          if (!item.type || !item.type.startsWith('image/')) continue;
          const blob = item.getAsFile();
          if (!blob) continue;

          const extension = extensionForMimeType(blob.type);
          return new File([blob], 'clipboard-image' + extension, {
            type: blob.type || 'image/png',
          });
        }

        return null;
      }

      function fileUrl(storagePath) {
        if (!storagePath) return null;
        return '/storage/' + storagePath.split('/').map(encodeURIComponent).join('/');
      }

      function renderArtifacts(manifest) {
        state.manifest = manifest;
        const clean = manifest?.images?.clean || {};
        const raw = manifest?.images?.raw || [];
        state.hasRawImage = Boolean(raw[0]);

        el.rawPath.textContent = raw[0] || 'None';
        el.vectorPath.textContent = clean.vectorInput || 'Not generated';
        el.runVectorDoctor.disabled = !state.jobId || !Boolean(clean.subjectTransparent || clean.subjectClean);
        el.runVectorize.disabled = !state.jobId || !Boolean(manifest?.debug?.vectorDoctor);
        syncPlaceholderControls();
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

      function clearVectorDoctorPanel(message) {
        state.vectorDoctor = null;
        el.vectorDoctorSummary.innerHTML =
          '<div class="summary-row"><span class="summary-label">Vector doctor</span><span class="summary-value">' +
          escapeHtml(message || 'No vector-doctor run yet.') +
          '</span></div>';
        el.vectorDoctorArtifacts.innerHTML = '';
      }

      function renderVectorDoctorPanel(payload) {
        const vectorDoctor = payload && payload.artifacts ? payload : null;
        state.vectorDoctor = vectorDoctor;

        if (!vectorDoctor) {
          clearVectorDoctorPanel('No vector-doctor run yet.');
          return;
        }

        const grouped = Array.isArray(vectorDoctor.groupedRegions) ? vectorDoctor.groupedRegions : [];
        const groupedText = grouped.filter((region) => region.role === 'text-group').length;
        const groupedShape = grouped.filter((region) => region.role === 'shape-group').length;
        const groupedAccent = grouped.filter((region) => region.role === 'accent-line-group').length;
        const suppressed = Array.isArray(vectorDoctor.suppressedRegions) ? vectorDoctor.suppressedRegions.length : 0;

        el.vectorDoctorSummary.innerHTML =
          '<div class="summary-row"><span class="summary-label">Source image</span><span class="summary-value">' + escapeHtml(vectorDoctor.sourceImageUsed || '') + '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Trace source</span><span class="summary-value">' + escapeHtml(vectorDoctor.traceSourceUsed || '') + '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Grouped regions</span><span class="summary-value">' + escapeHtml(String(grouped.length)) + ' total, ' + escapeHtml(String(groupedText)) + ' text, ' + escapeHtml(String(groupedShape)) + ' shape, ' + escapeHtml(String(groupedAccent)) + ' accent</span></div>' +
          '<div class="summary-row"><span class="summary-label">Suppressed</span><span class="summary-value">' + escapeHtml(String(suppressed)) + ' region(s)</span></div>';

        el.vectorDoctorArtifacts.innerHTML = '';
        const artifacts = [
          ['colorPreview', 'Color preview'],
          ['traceInput', 'Trace input'],
          ['textPreview', 'Text preview'],
          ['arcTextPreview', 'Arc text preview'],
          ['scriptTextPreview', 'Script text preview'],
          ['shapePreview', 'Shape preview'],
          ['accentPreview', 'Accent preview'],
          ['contourPreview', 'Contour preview'],
        ];

        artifacts.forEach(([key, label]) => {
          const storagePath = vectorDoctor.artifacts && vectorDoctor.artifacts[key];
          if (!storagePath) return;

          const card = document.createElement('article');
          card.className = 'artifact-card';
          const title = document.createElement('h3');
          title.textContent = label;
          card.appendChild(title);

          const url = fileUrl(storagePath);
          if (url) {
            const image = document.createElement('img');
            image.src = url + '?v=' + Date.now();
            image.alt = label;
            card.appendChild(image);
          }

          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.textContent = storagePath;
          card.appendChild(link);
          el.vectorDoctorArtifacts.appendChild(card);
        });
      }

      function clearVectorizePanel(message) {
        state.vectorize = null;
        el.vectorizeSummary.innerHTML =
          '<div class="summary-row"><span class="summary-label">Vectorize</span><span class="summary-value">' +
          escapeHtml(message || 'No vector SVG outputs yet.') +
          '</span></div>';
        el.vectorizeArtifacts.innerHTML = '';
      }

      function renderVectorizePanel(manifest) {
        const vectorize = manifest?.debug?.vectorize || null;
        const svg = manifest?.svg || {};
        state.vectorize = vectorize;

        if (!vectorize || (!svg.logo && !svg.detail && !svg.silhouette)) {
          clearVectorizePanel('No vector SVG outputs yet.');
          return;
        }

        const layers = Array.isArray(vectorize.layers) ? vectorize.layers : [];
        el.vectorizeSummary.innerHTML =
          '<div class="summary-row"><span class="summary-label">Outputs</span><span class="summary-value">' +
          escapeHtml([svg.logo ? 'logo' : '', svg.detail ? 'detail' : '', svg.silhouette ? 'silhouette' : ''].filter(Boolean).join(', ')) +
          '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Layers traced</span><span class="summary-value">' +
          escapeHtml(String(layers.length)) +
          '</span></div>' +
          '<div class="summary-row"><span class="summary-label">Source</span><span class="summary-value">' +
          escapeHtml(vectorize.sourceImageUsed || '') +
          '</span></div>';

        el.vectorizeArtifacts.innerHTML = '';
        const artifacts = [
          ['logo', 'Logo SVG'],
          ['detail', 'Detail SVG'],
          ['silhouette', 'Silhouette SVG'],
        ];

        artifacts.forEach(([key, label]) => {
          const storagePath = svg[key];
          if (!storagePath) return;

          const card = document.createElement('article');
          card.className = 'artifact-card';
          const title = document.createElement('h3');
          title.textContent = label;
          card.appendChild(title);

          const url = fileUrl(storagePath);
          if (url) {
            const image = document.createElement('img');
            image.src = url + '?v=' + Date.now();
            image.alt = label;
            card.appendChild(image);
          }

          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.textContent = storagePath;
          card.appendChild(link);
          el.vectorizeArtifacts.appendChild(card);
        });
      }

      async function refreshJob() {
        if (!state.jobId) return;

        const manifest = await fetch('/jobs/' + encodeURIComponent(state.jobId)).then((response) => {
          if (!response.ok) throw new Error('Failed to load job.');
          return response.json();
        });

        renderArtifacts(manifest);
        renderVectorDoctorPanel(manifest?.debug?.vectorDoctor || null);
        renderVectorizePanel(manifest);
        const debugJson = {
          doctor: manifest?.debug?.doctor || null,
          vectorDoctor: manifest?.debug?.vectorDoctor || null,
          vectorize: manifest?.debug?.vectorize || null,
        };
        el.debugOutput.textContent = debugJson
          ? JSON.stringify(debugJson, null, 2)
          : 'No debug data yet.';
      }

      async function analyzeText() {
        if (!state.jobId) throw new Error('Create a job first.');

        setStatus('Analyzing text...', '');
        const response = await fetch('/jobs/' + encodeURIComponent(state.jobId) + '/text-detect', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            source: el.textSource.value,
          }),
        });

        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.detail || json.error || 'Text detection failed.');
        }

        renderTextDetectionPanel(json);
        setReplacementEditorFromDetection(json.detection, true);
        setStatus('Text detection completed.', 'success');
      }

      async function generateReplacement() {
        if (!state.jobId) throw new Error('Create a job first.');

        setStatus('Generating replacement SVG...', '');
        const response = await fetch('/jobs/' + encodeURIComponent(state.jobId) + '/text-replacement', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            source: el.textSource.value,
            mode: el.replacementMode.value,
            replacementText: el.replacementText.value.trim() || null,
            preferredFontFamily: el.replacementFontFamily.value.trim() || null,
            preferredFontSizePx: Number(el.replacementFontSize.value) || null,
            preferredAngleDeg: Number(el.replacementAngle.value) || null,
            preferredLetterSpacing: Number(el.replacementLetterSpacing.value) || null,
            preferredTextAnchor: el.replacementAnchor.value || 'start',
            preferredWeight: el.replacementWeight.value || 'normal',
            preferredStyle: el.replacementStyle.value || 'normal',
            preferredFill: normalizeColor(el.replacementFill.value),
          }),
        });

        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.detail || json.error || 'Text replacement failed.');
        }

        renderTextDetectionPanel(json);
        renderReplacementResult(json);
        el.debugOutput.textContent = JSON.stringify(
          {
            source: json.source,
            sourcePath: json.sourcePath,
            detection: json.detection,
            replacement: json.replacement && json.replacement.debug ? json.replacement.debug : null,
          },
          null,
          2,
        );
        setStatus('Replacement SVG generated.', 'success');
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

      async function createJobFromPlaceholder() {
        if (!state.placeholder || !state.placeholder.exists) {
          throw new Error('Save a placeholder image first.');
        }

        await createJob();
        await usePlaceholderOnCurrentJob(false);
        setStatus('Job created from placeholder.', 'success');
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

      async function savePlaceholder() {
        const file = getSelectedFile();

        if (file) {
          setStatus('Saving placeholder image...', '');
          const response = await fetch('/placeholder/raw-image?filename=' + encodeURIComponent(file.name), {
            method: 'PUT',
            headers: {
              'content-type': file.type || 'application/octet-stream',
            },
            body: file,
          });

          const json = await response.json();
          if (!response.ok) {
            throw new Error(json.detail || json.error || 'Failed to save placeholder image.');
          }

          state.placeholder = json.placeholder || null;
          renderPlaceholderStatus();
          setStatus('Placeholder image saved.', 'success');
          return;
        }

        if (!state.jobId || !state.hasRawImage) {
          throw new Error('Choose an image or upload one to the current job first.');
        }

        setStatus('Saving current job image as placeholder...', '');
        const response = await fetch('/placeholder/from-job/' + encodeURIComponent(state.jobId), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.detail || json.error || 'Failed to save placeholder image.');
        }

        state.placeholder = json.placeholder || null;
        renderPlaceholderStatus();
        setStatus('Current job raw image saved as placeholder.', 'success');
      }

      async function usePlaceholderOnCurrentJob(showSuccess = true) {
        if (!state.jobId) throw new Error('Create a job first.');
        if (!state.placeholder || !state.placeholder.exists) {
          throw new Error('Save a placeholder image first.');
        }

        setStatus('Applying placeholder image to current job...', '');
        const response = await fetch('/jobs/' + encodeURIComponent(state.jobId) + '/use-placeholder', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.detail || json.error || 'Failed to apply placeholder image.');
        }

        await refreshJob();
        if (showSuccess) {
          setStatus('Placeholder image applied to current job.', 'success');
        }
      }

      async function runDoctor() {
        if (!state.jobId) throw new Error('Create a job first.');
        if (!state.hasRawImage) throw new Error('Upload or paste a raw image first.');

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

      async function runVectorDoctor() {
        if (!state.jobId) throw new Error('Create a job first.');
        if (!state.manifest?.images?.clean?.subjectTransparent && !state.manifest?.images?.clean?.subjectClean) {
          throw new Error('Run image-doctor first.');
        }

        setStatus('Running vector-doctor...', '');
        const response = await fetch('/jobs/' + encodeURIComponent(state.jobId) + '/vector-doctor', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.detail || json.error || 'Vector-doctor failed.');
        }

        renderVectorDoctorPanel(json);
        await refreshJob();
        setStatus('Vector-doctor completed.', 'success');
      }

      async function runVectorize() {
        if (!state.jobId) throw new Error('Create a job first.');
        if (!state.manifest?.debug?.vectorDoctor) {
          throw new Error('Run vector-doctor first.');
        }

        setStatus('Running vectorize...', '');
        const response = await fetch('/jobs/' + encodeURIComponent(state.jobId) + '/vectorize', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.detail || json.error || 'Vectorize failed.');
        }

        renderVectorizePanel(json);
        await refreshJob();
        setStatus('Vectorize completed.', 'success');
      }

      function scheduleDoctorRun(reason) {
        if (!state.jobId || !state.hasRawImage) {
          return;
        }

        if (state.rerunTimer) {
          window.clearTimeout(state.rerunTimer);
        }

        setStatus(reason || 'Settings changed. Re-running image-doctor...', '');
        state.rerunTimer = window.setTimeout(() => {
          state.rerunTimer = null;
          runDoctor().catch((error) => {
            setStatus(error.message || 'Image-doctor failed.', 'error');
          });
        }, 250);
      }

      el.createJob.addEventListener('click', () => {
        createJob().catch((error) => setStatus(error.message || 'Create job failed.', 'error'));
      });

      el.rawImage.addEventListener('change', () => {
        clearPastedFile();
        updateSelectedImageLabel();
      });

      el.pasteZone.addEventListener('paste', (event) => {
        const file = getClipboardImageFile(event);
        if (!file) {
          return;
        }

        event.preventDefault();
        handlePastedFile(file).catch((error) => {
          setStatus(error.message || 'Clipboard upload failed.', 'error');
        });
      });

      window.addEventListener('paste', (event) => {
        const activeTag = document.activeElement && document.activeElement.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
          return;
        }

        const file = getClipboardImageFile(event);
        if (!file) {
          return;
        }

        event.preventDefault();
        handlePastedFile(file).catch((error) => {
          setStatus(error.message || 'Clipboard upload failed.', 'error');
        });
      });

      el.uploadRaw.addEventListener('click', () => {
        uploadRaw().catch((error) => setStatus(error.message || 'Upload failed.', 'error'));
      });

      el.savePlaceholder.addEventListener('click', () => {
        savePlaceholder().catch((error) => setStatus(error.message || 'Save placeholder failed.', 'error'));
      });

      el.usePlaceholder.addEventListener('click', () => {
        usePlaceholderOnCurrentJob().catch((error) => setStatus(error.message || 'Use placeholder failed.', 'error'));
      });

      el.createJobFromPlaceholder.addEventListener('click', () => {
        createJobFromPlaceholder().catch((error) => setStatus(error.message || 'Create-from-placeholder failed.', 'error'));
      });

      el.runDoctor.addEventListener('click', () => {
        runDoctor().catch((error) => setStatus(error.message || 'Image-doctor failed.', 'error'));
      });

      el.runVectorDoctor.addEventListener('click', () => {
        runVectorDoctor().catch((error) => setStatus(error.message || 'Vector-doctor failed.', 'error'));
      });

      el.runVectorize.addEventListener('click', () => {
        runVectorize().catch((error) => setStatus(error.message || 'Vectorize failed.', 'error'));
      });

      el.refreshJob.addEventListener('click', () => {
        refreshJob()
          .then(() => setStatus('Job refreshed.', 'success'))
          .catch((error) => setStatus(error.message || 'Refresh failed.', 'error'));
      });

      el.analyzeText.addEventListener('click', () => {
        analyzeText().catch((error) => setStatus(error.message || 'Text detection failed.', 'error'));
      });

      el.useDetectedText.addEventListener('click', () => {
        if (!state.textDetection || !state.textDetection.text) {
          return;
        }
        el.replacementText.value = state.textDetection.text;
        markReplacementDirty('Detected text restored. Generate replacement to refresh.');
      });

      el.generateReplacement.addEventListener('click', () => {
        generateReplacement().catch((error) => setStatus(error.message || 'Text replacement failed.', 'error'));
      });

      el.downloadReplacement.addEventListener('click', () => {
        if (!state.replacementDownloadUrl || !state.replacementResult) {
          setStatus('Generate a replacement SVG first.', 'error');
          return;
        }

        const link = document.createElement('a');
        link.href = state.replacementDownloadUrl;
        link.download = state.replacementResult.fileName || 'replacement-text.svg';
        link.click();
      });

      el.detailPreset.addEventListener('change', () => {
        applyPreset(el.detailPreset.value);
        scheduleDoctorRun('Detail preset changed. Re-running image-doctor...');
      });

      el.silhouettePreset.addEventListener('change', () => {
        applySilhouettePreset(el.silhouettePreset.value);
        scheduleDoctorRun('Silhouette preset changed. Re-running image-doctor...');
      });

      [el.threshold, el.contrast, el.brightnessOffset, el.sharpenSigma].forEach((input) => {
        input.addEventListener('input', () => {
          syncVectorControlLabels();
          scheduleDoctorRun('Vector settings changed. Re-running image-doctor...');
        });
      });

      [el.silhouetteThreshold, el.silhouetteGrow, el.silhouetteBlur].forEach((input) => {
        input.addEventListener('input', () => {
          syncSilhouetteControlLabels();
          scheduleDoctorRun('Silhouette settings changed. Re-running image-doctor...');
        });
      });

      [
        el.replacementMode,
        el.replacementText,
        el.replacementFontFamily,
        el.replacementFontSize,
        el.replacementAngle,
        el.replacementLetterSpacing,
        el.replacementAnchor,
        el.replacementWeight,
        el.replacementStyle,
        el.replacementFill,
      ].forEach((input) => {
        input.addEventListener('input', () => markReplacementDirty());
        input.addEventListener('change', () => markReplacementDirty());
      });

      applyPreset(el.detailPreset.value);
      applySilhouettePreset(el.silhouettePreset.value);
      updateSelectedImageLabel();
      renderPlaceholderStatus();
      refreshPlaceholder().catch((error) => {
        setStatus(error.message || 'Failed to load placeholder.', 'error');
      });
      clearVectorDoctorPanel('Run image-doctor, then vector-doctor to inspect protected trace branches.');
      clearVectorizePanel('Run vector-doctor, then vectorize to build SVG outputs.');
      clearReplacementPreview('Run text detection first.');
    </script>
  </body>
</html>`;
}
