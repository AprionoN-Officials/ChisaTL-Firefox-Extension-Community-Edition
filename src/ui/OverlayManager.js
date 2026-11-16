/**
 * OverlayManager UI Component
 * Encapsulates floating translated image overlays, viewport positioning,
 * click-to-toggle visibility, and automatic SPA navigation cleanup.
 */
class OverlayManager {
  constructor(config = Config) {
    this.config = config;
    this.isLoopRunning = false;
    this.initSpaObserver();
    this.initHistoryInterceptor();
    this.initKeyboardNavListener();
  }

  /**
   * Applies or updates translated image overlay over target image element
   * @param {HTMLImageElement} img 
   * @param {string} translatedUrl 
   */
  applyOverlay(img, translatedUrl) {
    if (!img || !img.isConnected || !translatedUrl || typeof translatedUrl !== 'string') return;

    // 1. Clean up any existing overlay & toggle button for this image first
    this.removeOverlayForImage(img);

    const rect = img.getBoundingClientRect();
    const overlayId = this.config.ELEMENT_IDS.OVERLAY_PREFIX + Math.random().toString(36).substring(2, 9);
    img.setAttribute('data-chisa-overlay-id', overlayId);

    // 2. Translated Overlay Image (pointer-events: none allows native scrolling & clicks to pass through)
    const overlay = document.createElement('img');
    overlay.id = overlayId;
    overlay.className = this.config.CSS_CLASSES.OVERLAY;

    // 3. Dedicated Floating RAW / TL Toggle Switch Button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = `${overlayId}-toggle`;
    toggleBtn.className = 'chisa-toggle-btn';
    toggleBtn.innerText = 'TL';
    toggleBtn.title = 'Click to switch to Original (RAW)';

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (overlay.style.opacity === '0') {
        overlay.style.opacity = '1';
        toggleBtn.innerText = 'TL';
        toggleBtn.removeAttribute('data-mode');
        toggleBtn.title = 'Click to switch to Original (RAW)';
      } else {
        overlay.style.opacity = '0';
        toggleBtn.innerText = 'RAW';
        toggleBtn.setAttribute('data-mode', 'raw');
        toggleBtn.title = 'Click to switch to Translated (TL)';
      }
    });

    // Remove overlay & toggle button automatically when image source updates
    const onImgLoadOrChange = () => {
      this.removeOverlayForImage(img);
    };
    img.addEventListener('load', onImgLoadOrChange, { once: true });

    document.body.appendChild(overlay);
    document.body.appendChild(toggleBtn);

    overlay.src = translatedUrl;
    
    // Position fixed using exact viewport bounding rect
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.opacity = '1';
    overlay.style.display = 'block';

    toggleBtn.style.top = `${rect.top + 8}px`;
    toggleBtn.style.left = `${rect.left + 8}px`;
    toggleBtn.style.display = 'flex';

    // Start 60fps tracking loop on-demand
    this.ensurePositionLoopRunning();
  }

  /**
   * Removes overlay and toggle button for a specific image element
   */
  removeOverlayForImage(img) {
    if (!img) return;
    const overlayId = img.getAttribute('data-chisa-overlay-id');
    if (overlayId) {
      const overlay = document.getElementById(overlayId);
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      const toggleBtn = document.getElementById(`${overlayId}-toggle`);
      if (toggleBtn && toggleBtn.parentNode) {
        toggleBtn.parentNode.removeChild(toggleBtn);
      }
      img.removeAttribute('data-chisa-overlay-id');
    }
  }

  /**
   * Clears all active translated overlays and toggle buttons from DOM
   */
  clearAllOverlays() {
    document.querySelectorAll('.' + this.config.CSS_CLASSES.OVERLAY).forEach(el => el.remove());
    document.querySelectorAll('.chisa-toggle-btn').forEach(el => el.remove());
    document.querySelectorAll('[data-chisa-overlay-id]').forEach(img => img.removeAttribute('data-chisa-overlay-id'));
    this.isLoopRunning = false;
  }

  /**
   * On-demand 60fps viewport sync loop (only active while overlays exist to guarantee 0% idle CPU overhead)
   */
  ensurePositionLoopRunning() {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    const updatePositions = () => {
      const activeImgs = document.querySelectorAll('[data-chisa-overlay-id]');
      if (activeImgs.length === 0) {
        this.isLoopRunning = false;
        return;
      }

      activeImgs.forEach(img => {
        const overlayId = img.getAttribute('data-chisa-overlay-id');
        const overlay = document.getElementById(overlayId);
        const toggleBtn = document.getElementById(`${overlayId}-toggle`);

        if (!img.isConnected) {
          // Clean up orphaned DOM elements if underlying image was unmounted
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (toggleBtn && toggleBtn.parentNode) toggleBtn.parentNode.removeChild(toggleBtn);
          return;
        }

        if (overlay) {
          const rect = img.getBoundingClientRect();

          // Hide overlay if image is completely scrolled out of viewport
          if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
            overlay.style.display = 'none';
            if (toggleBtn) toggleBtn.style.display = 'none';
          } else {
            overlay.style.display = 'block';
            overlay.style.top = `${rect.top}px`;
            overlay.style.left = `${rect.left}px`;
            overlay.style.width = `${rect.width}px`;
            overlay.style.height = `${rect.height}px`;

            if (toggleBtn) {
              toggleBtn.style.display = 'flex';
              toggleBtn.style.top = `${rect.top + 8}px`;
              toggleBtn.style.left = `${rect.left + 8}px`;
            }
          }
        }
      });

      requestAnimationFrame(updatePositions);
    };

    window.addEventListener('scroll', updatePositions, { passive: true, capture: true });
    window.addEventListener('resize', updatePositions, { passive: true });
    requestAnimationFrame(updatePositions);
  }

  /**
   * Observes URL changes, img.src attribute mutations, and DOM removals (SPA reader unmounts)
   */
  initSpaObserver() {
    let lastUrl = location.href;

    new MutationObserver((mutations) => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        this.clearAllOverlays();
        return;
      }

      for (const m of mutations) {
        if (m.type === 'attributes' && m.target.tagName === 'IMG' && m.attributeName === 'src') {
          this.removeOverlayForImage(m.target);
        }

        if (m.removedNodes && m.removedNodes.length > 0) {
          m.removedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'IMG') {
                this.removeOverlayForImage(node);
              } else if (node.querySelectorAll) {
                node.querySelectorAll('img').forEach(img => this.removeOverlayForImage(img));
              }
            }
          });
        }
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  }

  /**
   * Intercepts HTML5 History API (pushState/replaceState/popstate) for seamless SPA page navigation
   */
  initHistoryInterceptor() {
    window.addEventListener('popstate', () => this.clearAllOverlays());

    const wrapHistory = (type) => {
      const orig = history[type];
      if (!orig || orig.__chisaWrapped) return orig;

      const wrapper = function (...args) {
        const result = orig.apply(this, args);
        window.dispatchEvent(new Event('chisa-location-change'));
        return result;
      };
      wrapper.__chisaWrapped = true;
      return wrapper;
    };

    if (history.pushState && !history.pushState.__chisaWrapped) {
      history.pushState = wrapHistory('pushState');
    }
    if (history.replaceState && !history.replaceState.__chisaWrapped) {
      history.replaceState = wrapHistory('replaceState');
    }
    window.addEventListener('chisa-location-change', () => this.clearAllOverlays());
  }

  /**
   * Listens to keyboard page navigation (ArrowLeft, ArrowRight, PageUp, PageDown)
   * Ignores keydown events while user is typing inside input/textarea/contenteditable fields.
   */
  initKeyboardNavListener() {
    window.addEventListener('keydown', (e) => {
      const targetTag = e.target && e.target.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) {
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'PageUp' || e.key === 'PageDown') {
        setTimeout(() => this.clearAllOverlays(), 100);
      }
    });
  }
}
