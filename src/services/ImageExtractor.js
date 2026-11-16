/**
 * ImageExtractor Service
 * Encapsulates logic for extracting image data from DOM elements.
 * Optimizes high-res images (e.g. MangaDex 4K pages) by capping max dimension to 1600px
 * for 4X faster data transfer and YOLO inference without quality loss.
 */
class ImageExtractor {
  constructor(config = Config) {
    this.config = config;
  }

  /**
   * Extracts image URL or compressed Base64 Data URL
   * @param {HTMLImageElement} img 
   * @returns {Promise<string|null>} DataURL string if extracted, or null if direct HTTP(S) URL can be used
   */
  async extract(img) {
    if (!img || !img.src) return null;

    // 1. Prioritize Canvas / DataURL export (0ms local RAM transfer & bypasses CDN 403 anti-hotlinking)
    try {
      const origW = img.naturalWidth || img.width || 0;
      const origH = img.naturalHeight || img.height || 0;

      if (origW <= 0 || origH <= 0) {
        return null;
      }

      // Cap max dimension to 1600px for 4X faster transfer & YOLO detection
      const MAX_DIM = 1600;
      let targetW = origW;
      let targetH = origH;

      if (origW > MAX_DIM || origH > MAX_DIM) {
        if (origW > origH) {
          targetW = MAX_DIM;
          targetH = Math.round((origH * MAX_DIM) / origW);
        } else {
          targetH = MAX_DIM;
          targetW = Math.round((origW * MAX_DIM) / origH);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL('image/jpeg', this.config.IMAGE_EXTRACTION.JPEG_QUALITY);
        if (dataUrl && dataUrl.length > this.config.IMAGE_EXTRACTION.MIN_DATA_URL_LENGTH) {
          return dataUrl;
        }
      }
    } catch (e) {
      // Tainted canvas due to CORS - silently fall back to page-level fetch
      console.debug('[ChisaTL] Canvas export tainted, falling back to fetch:', e);
    }

    // 3. Fallback: fetch directly in page context
    try {
      const res = await fetch(img.src);
      if (res.ok) {
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.debug('[ChisaTL] Page-level fetch fallback skipped:', e);
    }

    return null;
  }
}
