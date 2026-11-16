/**
 * FloatingButtons UI Component
 * Encapsulates creation, positioning, mouse hover lifecycle,
 * state transitions, and error tooltips for DL and TL buttons.
 */
class FloatingButtons {
  constructor(config = Config) {
    this.config = config;
    this.dlButton = null;
    this.tlButton = null;
    this.activeImage = null;
    this.onDlClickCallback = null;
    this.onTlClickCallback = null;
    this.isEnabledCallback = null;
    this.resetTimer = null;
    this.createButtons();
  }

  createButtons() {
    // Create DL button
    this.dlButton = document.createElement('button');
    this.dlButton.id = this.config.ELEMENT_IDS.DL_BUTTON;
    this.dlButton.innerText = 'DL';
    this.dlButton.title = 'Send to Chisa Translate App';

    // Create TL button
    this.tlButton = document.createElement('button');
    this.tlButton.id = this.config.ELEMENT_IDS.TL_BUTTON;
    this.tlButton.innerText = 'TL';
    this.tlButton.title = 'Translate in-place on this webpage';

    document.body.appendChild(this.dlButton);
    document.body.appendChild(this.tlButton);
  }

  bindEvents(onDlClick, onTlClick, isEnabledCheck = null) {
    this.onDlClickCallback = onDlClick;
    this.onTlClickCallback = onTlClick;
    this.isEnabledCallback = isEnabledCheck;

    // Show and position buttons when mouse touches or moves over any valid image
    document.addEventListener('mouseover', (e) => this.handleMouseOver(e));
    document.addEventListener('mousemove', (e) => this.handleMouseOver(e), { passive: true });

    // Keep buttons pinned to the image when scrolling or resizing
    window.addEventListener('scroll', () => {
      if (this.isEnabledCallback && !this.isEnabledCallback()) {
        this.hideButtons();
        return;
      }
      if (this.activeImage && this.activeImage.isConnected && this.dlButton.style.display !== 'none') {
        this.positionButtons(this.activeImage);
      }
    }, { passive: true, capture: true });

    window.addEventListener('resize', () => {
      if (this.isEnabledCallback && !this.isEnabledCallback()) {
        this.hideButtons();
        return;
      }
      if (this.activeImage && this.activeImage.isConnected && this.dlButton.style.display !== 'none') {
        this.positionButtons(this.activeImage);
      }
    }, { passive: true });

    this.dlButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onDlClickCallback) this.onDlClickCallback(this.activeImage);
    });

    this.tlButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onTlClickCallback) this.onTlClickCallback(this.activeImage);
    });
  }

  findValidImageInElement(el) {
    if (!el) return null;
    if (el.tagName === 'IMG' && this.isValidImage(el)) return el;
    if (typeof el.querySelectorAll === 'function') {
      const childImgs = el.querySelectorAll('img');
      for (const cImg of childImgs) {
        if (this.isValidImage(cImg)) return cImg;
      }
    }
    return null;
  }

  handleMouseOver(e) {
    if (this.isEnabledCallback && !this.isEnabledCallback()) {
      this.hideButtons();
      return;
    }

    const target = e.target;
    if (target === this.dlButton || target === this.tlButton) {
      return; // Keep buttons visible while interacting with them
    }

    let imgCandidate = this.findValidImageInElement(target);

    // Multi-layer penetration via elementsFromPoint for transparent overlays (e.g. Google Images preview)
    if (!imgCandidate && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
      try {
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        for (const el of elements) {
          if (el === this.dlButton || el === this.tlButton) continue;
          imgCandidate = this.findValidImageInElement(el);
          if (imgCandidate) break;
        }
      } catch (err) {
        // Ignore elementsFromPoint edge case errors
      }
    }

    if (imgCandidate) {
      this.activeImage = imgCandidate;
      this.positionButtons(imgCandidate);
    }
  }

  isValidImage(img) {
    if (!img || !img.isConnected) return false;
    const minWidth = 100;
    const minHeight = 100;
    const rect = img.getBoundingClientRect();
    return (rect.width >= minWidth && rect.height >= minHeight);
  }

  positionButtons(img) {
    if (this.isEnabledCallback && !this.isEnabledCallback()) {
      this.hideButtons();
      return;
    }
    if (!img || !img.isConnected) {
      this.hideButtons();
      return;
    }
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.hideButtons();
      return;
    }

    // Position fixed using exact viewport bounding rect
    const top = rect.top + this.config.BUTTON_OFFSET.TOP_OFFSET;
    const dlLeft = rect.right - this.config.BUTTON_OFFSET.DL_RIGHT_OFFSET;
    const tlLeft = rect.right - this.config.BUTTON_OFFSET.TL_RIGHT_OFFSET;

    this.dlButton.style.top = `${top}px`;
    this.dlButton.style.left = `${dlLeft}px`;
    this.dlButton.style.display = 'flex';

    this.tlButton.style.top = `${top}px`;
    this.tlButton.style.left = `${tlLeft}px`;
    this.tlButton.style.display = 'flex';
  }

  hideButtons() {
    if (this.dlButton) this.dlButton.style.display = 'none';
    if (this.tlButton) this.tlButton.style.display = 'none';
    this.activeImage = null;
  }

  setButtonState(button, status, text, tooltip = '') {
    if (button) {
      button.setAttribute('data-status', status);
      button.innerText = text;
      if (tooltip) {
        button.title = tooltip;
      }
    }
  }

  resetButtonState() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    if (this.dlButton) {
      this.dlButton.removeAttribute('data-status');
      this.dlButton.innerText = 'DL';
      this.dlButton.title = 'Send to Chisa Translate App';
      this.dlButton.disabled = false;
    }
    if (this.tlButton) {
      this.tlButton.removeAttribute('data-status');
      this.tlButton.innerText = 'TL';
      this.tlButton.title = 'Translate in-place on this webpage';
      this.tlButton.disabled = false;
    }
  }

  setLoading(button) {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    this.setButtonState(button, 'loading', '...');
    if (this.dlButton) this.dlButton.disabled = true;
    if (this.tlButton) this.tlButton.disabled = true;
  }

  setSuccess(button) {
    this.setButtonState(button, 'success', 'OK');
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.resetButtonState(), this.config.TIMINGS.RESET_STATE_DELAY_MS);
  }

  setError(button, errorMsg) {
    this.setButtonState(button, 'error', '❌', `Error: ${errorMsg}`);
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.resetButtonState(), this.config.TIMINGS.RESET_STATE_DELAY_MS);
  }
}
