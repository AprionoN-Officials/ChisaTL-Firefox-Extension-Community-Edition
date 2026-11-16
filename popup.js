class ChisaPushPopup {
  constructor() {
    this.toggleElement = null;
    this.statusTextElement = null;
  }

  init() {
    this.toggleElement = document.getElementById('toggle-state');
    this.statusTextElement = document.getElementById('status-text');

    if (!this.toggleElement || !this.statusTextElement) {
      console.error('[ChisaPush] Required popup DOM elements not found.');
      return;
    }

    this.loadState();
    this.bindEvents();
  }

  loadState() {
    chrome.storage.local.get('enabled', (data) => {
      const isEnabled = data.enabled !== false;
      this.toggleElement.checked = isEnabled;
      this.updateUI(isEnabled);
    });
  }

  bindEvents() {
    this.toggleElement.addEventListener('change', () => {
      const isEnabled = this.toggleElement.checked;
      chrome.storage.local.set({ enabled: isEnabled }, () => {
        this.updateUI(isEnabled);
      });
    });

    const downloadBtn = document.querySelector('.download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://www.chisa.id/download' });
      });
    }

    const trakteerBtn = document.querySelector('.trakteer-btn');
    if (trakteerBtn) {
      trakteerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://trakteer.id/indravoyager' });
      });
    }
  }

  updateUI(isEnabled) {
    if (isEnabled) {
      this.statusTextElement.innerText = 'Enabled';
      this.statusTextElement.className = 'status-title';
    } else {
      this.statusTextElement.innerText = 'Disabled';
      this.statusTextElement.className = 'status-title disabled';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const popup = new ChisaPushPopup();
  popup.init();
});
