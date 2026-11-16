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
