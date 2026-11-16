/**
 * ChisaBridge Service
 * Encapsulates background communications with Chisa Translate Desktop App.
 * Handles binary streaming, CORS headers, and CDN Referer bypass.
 */
class ChisaBridge {
  constructor(config = Config) {
    this.config = config;
  }

  /**
   * Sends image bytes/URL to desktop app for loading into main GUI
   */
  async sendImage(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error("Invalid image URL provided.");
    }

    const blob = await this.fetchImageBlob(imageUrl);
    const arrayBuffer = await blob.arrayBuffer();

    const response = await fetch(this.config.API.SEND_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "application/octet-stream"
      },
      body: arrayBuffer
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(this.formatErrorMessage(response.status, errText, response.statusText));
    }

    return await response.json();
  }

  /**
   * Translates image directly in-place and returns translated Base64 Data URL
   */
  async translateImage(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error("Invalid image URL provided.");
    }

    const blob = await this.fetchImageBlob(imageUrl);
    const arrayBuffer = await blob.arrayBuffer();

    const response = await fetch(this.config.API.TRANSLATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "application/octet-stream"
      },
      body: arrayBuffer
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(this.formatErrorMessage(response.status, errText, response.statusText));
    }

    const responseBlob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read translated image binary."));
      reader.readAsDataURL(responseBlob);
    });
  }

  formatErrorMessage(status, errText, statusText) {
    if (errText) {
      try {
        const parsed = JSON.parse(errText);
        if (parsed && (parsed.error || parsed.message)) {
          return parsed.error || parsed.message;
        }
      } catch (e) {
        // Not JSON
      }
      return errText;
    }
    return `HTTP ${status}: ${statusText}`;
  }

  /**
   * Utility helper to fetch image blob with Referer header derived from URL origin
   */
  async fetchImageBlob(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error("Cannot fetch blob from empty URL.");
    }

    if (imageUrl.startsWith('data:')) {
      const parts = imageUrl.split(',');
      if (parts.length < 2) {
        throw new Error("Malformed data URL format.");
      }
      const byteString = atob(parts[1]);
      const mimeMatch = parts[0].match(/:([^;]+);/);
      const mimeString = mimeMatch ? mimeMatch[1] : 'image/png';
      
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
    }

    const headers = {};
    try {
      const u = new URL(imageUrl);
      headers['Referer'] = u.origin + '/';
    } catch (e) {
      // Ignore URL origin derivation error for local/relative paths
    }

    const response = await fetch(imageUrl, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch image binary: HTTP ${response.status} ${response.statusText}`);
    }
    return await response.blob();
  }
}
