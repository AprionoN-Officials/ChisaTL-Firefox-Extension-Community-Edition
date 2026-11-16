/**
 * ChisaTLExtension Orchestrator Class
 * Main controller that coordinates FloatingButtons, ImageExtractor, and OverlayManager.
 */
class ChisaTLExtension {
  constructor(config = Config) {
    this.config = config;
    this.isEnabled = true;
    this.lastRightClickedImage = null;
    this.extractor = new ImageExtractor(config);
    this.overlayManager = new OverlayManager(config);
    this.buttons = new FloatingButtons(config);
  }

  init() {
    this.checkEnabledState();
    this.listenToStorageChanges();
    this.listenToRightClickEvents();
    this.listenToRuntimeMessages();
    this.buttons.bindEvents(
      (img) => this.handleDlAction(img),
      (img) => this.handleTlAction(img),
      () => this.isEnabled
    );
  }

  checkEnabledState() {
    chrome.storage.local.get(this.config.STORAGE_KEYS.ENABLED, (data) => {
      this.isEnabled = data.enabled !== false;
      if (!this.isEnabled) {
        this.buttons.hideButtons();
        this.overlayManager.clearAllOverlays();
      }
    });
  }

  listenToStorageChanges() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.enabled) {
        this.isEnabled = changes.enabled.newValue;
        if (!this.isEnabled) {
          this.buttons.hideButtons();
          this.overlayManager.clearAllOverlays();
        }
      }
    });
  }

  /**
   * Listens to contextmenu events and drills through transparent DOM overlay layers
   * using elementsFromPoint to guarantee finding the target IMG tag at cursor coordinates.
   */
  listenToRightClickEvents() {
    document.addEventListener('contextmenu', (e) => {
      if (!this.isEnabled) return;
      this.lastRightClickedImage = null; // Clear previous stale image reference

      // 1. Direct target check
      if (e.target && e.target.tagName === 'IMG') {
        this.lastRightClickedImage = e.target;
        return;
      }

      // 2. Child IMG check
      if (e.target && typeof e.target.querySelector === 'function') {
        const childImg = e.target.querySelector('img');
        if (childImg) {
          this.lastRightClickedImage = childImg;
          return;
        }
      }

      // 3. Multi-layer DOM penetration at (e.clientX, e.clientY)
      if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
        try {
          const elements = document.elementsFromPoint(e.clientX, e.clientY);
          for (const el of elements) {
            if (el.tagName === 'IMG') {
              this.lastRightClickedImage = el;
              return;
            }
            const nestedImg = el.querySelector && el.querySelector('img');
            if (nestedImg) {
              this.lastRightClickedImage = nestedImg;
              return;
            }
          }
        } catch (err) {
          // Ignore elementsFromPoint check failure
        }
      }
    }, true);
  }

  listenToRuntimeMessages() {
    chrome.runtime.onMessage.addListener((message) => {
      if (!this.isEnabled) return;

      if (message.action === 'contextMenuDl') {
        const img = this.findTargetImage(message.srcUrl);
        if (img) this.handleDlAction(img);
      } else if (message.action === 'contextMenuTl') {
        const img = this.findTargetImage(message.srcUrl);
        if (img) this.handleTlAction(img);
      } else if (message.action === 'applyOverlayByUrl' && message.translatedUrl) {
        const img = this.findTargetImage(message.originalUrl);
        if (img) this.overlayManager.applyOverlay(img, message.translatedUrl);
      }
    });
  }

  /**
   * Robust 4-layer fallback strategy for locating the target image
   */
  findTargetImage(srcUrl) {
    // Layer 1: Last right-clicked image via elementsFromPoint
    if (this.lastRightClickedImage && this.lastRightClickedImage.isConnected) {
      return this.lastRightClickedImage;
    }

    // Layer 2: Currently active image attached to floating buttons
    if (this.buttons && this.buttons.activeImage && this.buttons.activeImage.isConnected) {
      return this.buttons.activeImage;
    }

    // Layer 3: Exact or partial src URL match in DOM
    const imgs = document.querySelectorAll('img');
    if (srcUrl) {
      for (const img of imgs) {
        if (img.src === srcUrl || img.currentSrc === srcUrl || (img.src && img.src.includes(srcUrl))) {
          return img;
        }
      }
    }

    // Layer 4: Largest visible manga image in current viewport
    let maxArea = 0;
    let bestImg = null;
    for (const img of imgs) {
      const rect = img.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea && rect.width > 100 && rect.height > 100) {
        maxArea = area;
        bestImg = img;
      }
    }
    return bestImg;
  }

  async handleDlAction(targetImage) {
    if (!targetImage || !this.isEnabled) return;

    this.buttons.setLoading(this.buttons.dlButton);

    const dataUrl = await this.extractor.extract(targetImage);
    const message = dataUrl 
      ? { action: 'sendImageData', dataUrl: dataUrl }
      : { action: 'sendImage', url: targetImage.src };

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        const errorMsg = response?.error || chrome.runtime.lastError?.message || 'Send error';
        console.error('[ChisaTL] Send failed:', errorMsg);
        this.buttons.setError(this.buttons.dlButton, errorMsg);
      } else {
        this.buttons.setSuccess(this.buttons.dlButton);
      }
    });
  }

  async handleTlAction(targetImage) {
    if (!targetImage || !this.isEnabled) return;

    // Immediately remove previous overlay & toggle button when starting a new translation
    this.overlayManager.removeOverlayForImage(targetImage);

    this.buttons.setLoading(this.buttons.tlButton);

    const dataUrl = await this.extractor.extract(targetImage);
    const message = dataUrl 
      ? { action: 'translateImageData', dataUrl: dataUrl }
      : { action: 'translateImage', url: targetImage.src };

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        const errorMsg = response?.error || chrome.runtime.lastError?.message || 'Translation error';
        console.error('[ChisaTL] Translation failed:', errorMsg);
        this.buttons.setError(this.buttons.tlButton, errorMsg);
      } else {
        this.buttons.setSuccess(this.buttons.tlButton);
        if (response.translatedUrl) {
          this.overlayManager.applyOverlay(targetImage, response.translatedUrl);
        }
      }
    });
  }
}
