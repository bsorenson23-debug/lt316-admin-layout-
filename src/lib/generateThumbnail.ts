const SIZE = 120;

export const DEFAULT_TEMPLATE_THUMBNAIL_DATA_URL =
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
      `<rect width="${SIZE}" height="${SIZE}" fill="#333"/>` +
      `<rect x="4" y="4" width="112" height="112" rx="6" fill="none" stroke="#555" stroke-width="1"/>` +
      `</svg>`
  )}`;

export async function generateThumbnail(file: File): Promise<string> {
  return new Promise<string>((resolve) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(DEFAULT_TEMPLATE_THUMBNAIL_DATA_URL);
          return;
        }

        // Center-crop (object-fit: cover behavior)
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        const scale = Math.max(SIZE / srcW, SIZE / srcH);
        const drawW = srcW * scale;
        const drawH = srcH * scale;
        const dx = (SIZE - drawW) / 2;
        const dy = (SIZE - drawH) / 2;

        ctx.drawImage(img, dx, dy, drawW, drawH);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(DEFAULT_TEMPLATE_THUMBNAIL_DATA_URL);
      } finally {
        URL.revokeObjectURL(img.src);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(DEFAULT_TEMPLATE_THUMBNAIL_DATA_URL);
    };

    img.src = URL.createObjectURL(file);
  });
}
