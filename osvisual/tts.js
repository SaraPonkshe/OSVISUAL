(() => {
  // ─── Config ───────────────────────────────────────────────
  // Scope reading to these containers only (content, not nav/footer/forms)
  const CONTENT_SCOPE     = '#main, article, .box, section.container, .content-area';
  const READABLE_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption';
  const SKIP_SELECTOR     = 'header, footer, nav, form, .actions, .algoblock, label, select, input, button, script, style, [data-tts-skip]';
  const HIGHLIGHT_CLASS   = 'tts-highlight';

  // ─── State ────────────────────────────────────────────────
  let chunks    = [];
  let current   = -1;
  let utterance = null;
  let isPaused  = false;
  let isPlaying = false;
  let panelOpen = false;

  const synth = window.speechSynthesis;

  // ─── Collect readable elements (scoped + filtered) ────────
  function buildChunks() {
    chunks = [];
    const scopes = document.querySelectorAll(CONTENT_SCOPE);
    const roots  = scopes.length ? Array.from(scopes) : [document.body];

    roots.forEach(root => {
      root.querySelectorAll(READABLE_SELECTOR).forEach(el => {
        if (el.closest(SKIP_SELECTOR))  return;
        if (el.closest('#tts-panel'))   return;
        if (el.closest('#tts-fab'))     return;
        const text = el.innerText?.trim();
        if (text && text.length > 2)    chunks.push({ el, text });
      });
    });

    // Deduplicate (nested selectors can double-pick)
    const seen = new Set();
    chunks = chunks.filter(c => {
      if (seen.has(c.el)) return false;
      seen.add(c.el);
      return true;
    });
  }

  // ─── Highlight ────────────────────────────────────────────
  function clearHighlight() {
    document.querySelectorAll('.' + HIGHLIGHT_CLASS)
      .forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
  }

  function highlightChunk(index) {
    clearHighlight();
    if (index < 0 || index >= chunks.length) return;
    const el = chunks[index].el;
    el.classList.add(HIGHLIGHT_CLASS);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ─── Speak ────────────────────────────────────────────────
  function speakChunk(index) {
    if (index >= chunks.length) { stop(); return; }
    current = index;
    highlightChunk(current);
    updateButtons();

    const u = new SpeechSynthesisUtterance(chunks[index].text);
    u.rate  = parseFloat(document.getElementById('tts-rate')?.value || 1);
    utterance = u;

    u.onend   = () => { if (!isPaused) speakChunk(current + 1); };
    u.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') speakChunk(current + 1);
    };
    synth.speak(u);
  }

  // ─── Controls ─────────────────────────────────────────────
  function play() {
    if (!synth) return;
    if (isPaused) {
      isPaused  = false;
      isPlaying = true;
      synth.resume();
      updateButtons();
      return;
    }
    synth.cancel();
    buildChunks();
    if (!chunks.length) return;
    isPlaying = true;
    isPaused  = false;
    speakChunk(current < 0 ? 0 : current);
    updateButtons();
  }

  function pause() {
    if (!isPlaying) return;
    isPaused = true;
    synth.pause();
    updateButtons();
  }

  function stop() {
    isPlaying = false;
    isPaused  = false;
    current   = -1;
    synth.cancel();
    clearHighlight();
    updateButtons();
  }

  // ─── Click-to-read ────────────────────────────────────────
  function onElementClick(e) {
    const idx = chunks.findIndex(c => c.el === e.currentTarget);
    if (idx === -1) return;
    synth.cancel();
    isPlaying = true;
    isPaused  = false;
    speakChunk(idx);
    updateButtons();
  }

  function attachClickHandlers() {
    buildChunks();
    chunks.forEach(({ el }) => {
      el.classList.add('tts-clickable');
      el.removeEventListener('click', onElementClick);
      el.addEventListener('click', onElementClick);
    });
  }

  // ─── Button state sync ────────────────────────────────────
  function updateButtons() {
    const btnPlay  = document.getElementById('tts-play');
    const btnPause = document.getElementById('tts-pause');
    const btnStop  = document.getElementById('tts-stop');
    const fab      = document.getElementById('tts-fab');
    if (!btnPlay) return;

    btnPlay.disabled  = isPlaying && !isPaused;
    btnPause.disabled = !isPlaying || isPaused;
    btnStop.disabled  = !isPlaying && !isPaused;

    if (fab) fab.classList.toggle('tts-fab--playing', isPlaying && !isPaused);
  }

  // ─── Panel toggle ─────────────────────────────────────────
  function togglePanel() {
    panelOpen = !panelOpen;
    const panel = document.getElementById('tts-panel');
    const fab   = document.getElementById('tts-fab');
    if (!panel) return;
    panel.classList.toggle('tts-panel--open', panelOpen);
    fab.setAttribute('aria-expanded', String(panelOpen));
    fab.setAttribute('aria-label', panelOpen ? 'Close read aloud' : 'Read aloud');
    fab.querySelector('.tts-fab-icon--open').style.display  = panelOpen ? 'none'   : 'flex';
    fab.querySelector('.tts-fab-icon--close').style.display = panelOpen ? 'flex'   : 'none';
  }

  // ─── Build DOM ────────────────────────────────────────────
  function buildUI() {
    if (document.getElementById('tts-fab')) return;

    // FAB button
    const fab = document.createElement('button');
    fab.id = 'tts-fab';
    fab.setAttribute('aria-label', 'Read aloud');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('title', 'Read aloud');
    fab.innerHTML = `
      <span class="tts-fab-icon--open" style="display:flex;align-items:center;justify-content:center;" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
      </span>
      <span class="tts-fab-icon--close" style="display:none;align-items:center;justify-content:center;" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </span>
    `;
    fab.addEventListener('click', togglePanel);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'tts-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Read aloud controls');
    panel.innerHTML = `
      <div class="tts-panel-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
        Read Aloud
      </div>

      <div class="tts-btn-row">
        <button id="tts-play" class="tts-btn tts-btn--play" aria-label="Play">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Play
        </button>
        <button id="tts-pause" class="tts-btn" aria-label="Pause" disabled>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          Pause
        </button>
        <button id="tts-stop" class="tts-btn" aria-label="Stop" disabled>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          Stop
        </button>
      </div>

      <div class="tts-speed-row">
        <span class="tts-speed-label">Speed</span>
        <input id="tts-rate" type="range" min="0.5" max="2" step="0.1" value="1" aria-label="Reading speed">
        <span id="tts-rate-val">1.0×</span>
      </div>

      <p class="tts-hint">💡 Click any paragraph to start reading from there.</p>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    document.getElementById('tts-play') .addEventListener('click', play);
    document.getElementById('tts-pause').addEventListener('click', pause);
    document.getElementById('tts-stop') .addEventListener('click', stop);

    const rateInput = document.getElementById('tts-rate');
    const rateVal   = document.getElementById('tts-rate-val');
    rateInput.addEventListener('input', () => {
      rateVal.textContent = parseFloat(rateInput.value).toFixed(1) + '×';
    });

    updateButtons();
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    if (!('speechSynthesis' in window)) {
      console.warn('TTS: Web Speech API not supported.');
      return;
    }
    buildUI();
    attachClickHandlers();

    // Re-attach on dynamic content (covers simulator output)
    const observer = new MutationObserver(() => attachClickHandlers());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();