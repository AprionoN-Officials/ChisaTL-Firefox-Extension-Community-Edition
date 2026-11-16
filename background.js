/**
 * ChisaTL Background Service Worker
 * Leverages ChisaBridge service for communication with desktop application.
 */
/**
 * Centralized Configuration for ChisaTL Extension
 * Single Source of Truth for endpoints, selectors, timeouts, and constants.
 */
const Config = Object.freeze({
  API: {
    BASE_URL: 'http://localhost:5039',
    SEND_IMAGE_ENDPOINT: 'http://localhost:5039/image',
    TRANSLATE_ENDPOINT: 'http://localhost:5039/translate'
  },
  ELEMENT_IDS: {
    DL_BUTTON: 'chisa-dl-button',
    TL_BUTTON: 'chisa-tl-button',
    OVERLAY_PREFIX: 'chisa-overlay-'
  },
  CSS_CLASSES: {
    OVERLAY: 'chisa-translated-overlay'
  },
  BUTTON_OFFSET: {
    DL_RIGHT_OFFSET: 64,
    TL_RIGHT_OFFSET: 34,
    TOP_OFFSET: 8
  },
  IMAGE_EXTRACTION: {
    JPEG_QUALITY: 0.92,
    MIN_DATA_URL_LENGTH: 100
  },
  TIMINGS: {
    HIDE_DELAY_MS: 400,
    RESET_STATE_DELAY_MS: 1500
  },
  STORAGE_KEYS: {
    ENABLED: 'enabled'
  }
});


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

    let fetchOptions = {};
    try {
      const u = new URL(imageUrl);
      fetchOptions.referrer = u.origin + '/';
      fetchOptions.referrerPolicy = 'strict-origin-when-cross-origin';
    } catch (e) {
      // Ignore URL origin derivation error for local/relative paths
    }

    const response = await fetch(imageUrl, fetchOptions);
    if (!response.ok) {
      throw new Error(`Failed to fetch image binary: HTTP ${response.status} ${response.statusText}`);
    }
    return await response.blob();
  }
}


class ChisaTLBackgroundWorker {
  constructor(config = Config) {
    this.config = config;
    this.bridge = new ChisaBridge(config);
  }

  init() {
    this.bindMessageListeners();
    this.createContextMenus();
    this.bindContextMenu();
    this.bindStorageListener();
    this.syncBadgeState();
  }

  bindMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const isSend = message.action === "sendImageData" || message.action === "sendImage";
      const isTranslate = message.action === "translateImageData" || message.action === "translateImage";
      const targetUrl = message.dataUrl || message.url;

      if ((isSend || isTranslate) && targetUrl) {
        this.checkEnabledState((isEnabled) => {
          if (!isEnabled) {
            return sendResponse({ success: false, error: "ChisaTL is disabled." });
          }

          const promise = isSend
            ? this.bridge.sendImage(targetUrl)
            : this.bridge.translateImage(targetUrl);

          promise
            .then(result => {
              if (isSend) {
                sendResponse({ success: true, data: result });
              } else {
                sendResponse({ success: true, translatedUrl: result });
              }
            })
            .catch(error => {
              console.error('[ChisaTL] Background request failed:', error);
              sendResponse({ success: false, error: error.message || "Request failed." });
            });
        });
        return true;
      }
    });
  }

  bindContextMenu() {
    chrome.runtime.onInstalled.addListener(() => {
      this.createContextMenus();
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (!tab || typeof tab.id !== 'number' || tab.id < 0) return;

      this.checkEnabledState((isEnabled) => {
        if (!isEnabled) return;
        if (info.menuItemId === "sendToChisa") {
          chrome.tabs.sendMessage(tab.id, { action: 'contextMenuDl', srcUrl: info.srcUrl }).catch(() => {});
        } else if (info.menuItemId === "translateImageInPlace") {
          chrome.tabs.sendMessage(tab.id, { action: 'contextMenuTl', srcUrl: info.srcUrl }).catch(() => {});
        }
      });
    });
  }

  createContextMenus() {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "sendToChisa",
        title: "Send to Chisa Translate App",
        contexts: ["all"]
      });
      chrome.contextMenus.create({
        id: "translateImageInPlace",
        title: "Translate Image In-Place (ChisaTL)",
        contexts: ["all"]
      });
    });
  }

  bindStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.enabled) {
        this.updateIconBadge(changes.enabled.newValue !== false);
      }
    });
  }

  syncBadgeState() {
    this.checkEnabledState((isEnabled) => {
      this.updateIconBadge(isEnabled);
    });
  }

  checkEnabledState(callback) {
    chrome.storage.local.get(this.config.STORAGE_KEYS.ENABLED, (data) => {
      callback(data.enabled !== false);
    });
  }

  updateIconBadge(isEnabled) {
    if (isEnabled) {
      chrome.action.setBadgeText({ text: "" });
    } else {
      chrome.action.setBadgeText({ text: "OFF" });
      chrome.action.setBadgeBackgroundColor({ color: "#7a7a7a" });
    }
  }
}

const chisaTLBackgroundWorker = new ChisaTLBackgroundWorker();
chisaTLBackgroundWorker.init();
