(() => {
  'use strict';

  const API_BASES = [
    'https://all.api.radio-browser.info/json',
    'https://de1.api.radio-browser.info/json',
    'https://nl1.api.radio-browser.info/json',
    'https://at1.api.radio-browser.info/json'
  ];
  const STORAGE_KEY = 'scp-radio-v1';
  const REQUEST_TIMEOUT = 9000;
  const PAGE_SIZE = 36;
  const GENRES = ['Pop','Rock','Jazz','Classical','Electronic','Chillout','80s','90s','Ambient','Metal','News','Talk'];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const icons = {
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>',
    play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>',
    pause: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"></path></svg>',
    prev: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM18 5v14l-9-7z"></path></svg>',
    next: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM6 5l9 7-9 7z"></path></svg>',
    heart: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.8 8.6c0 5.2-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.6C3.2 5.8 5.2 4 7.8 4c1.5 0 2.9.7 3.8 1.9C12.5 4.7 13.8 4 15.5 4c2.6 0 5.3 1.8 5.3 4.6z"></path></svg>',
    settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"></path><path d="M19.4 15a1.8 1.8 0 0 0 .3 2l.1.1-1.7 1.7-.1-.1a1.8 1.8 0 0 0-2-.3 1.8 1.8 0 0 0-1 1.7v.2h-2.4v-.2a1.8 1.8 0 0 0-1-1.7 1.8 1.8 0 0 0-2 .3l-.1.1-1.7-1.7.1-.1a1.8 1.8 0 0 0 .3-2 1.8 1.8 0 0 0-1.7-1H6.3v-2.4h.2a1.8 1.8 0 0 0 1.7-1 1.8 1.8 0 0 0-.3-2l-.1-.1 1.7-1.7.1.1a1.8 1.8 0 0 0 2 .3 1.8 1.8 0 0 0 1-1.7v-.2H15v.2a1.8 1.8 0 0 0 1 1.7 1.8 1.8 0 0 0 2-.3l.1-.1 1.7 1.7-.1.1a1.8 1.8 0 0 0-.3 2 1.8 1.8 0 0 0 1.7 1h.2V14h-.2a1.8 1.8 0 0 0-1.7 1z"></path></svg>',
    clock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
    volume: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2"></path></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
    shuffle: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 3h5v5M4 5h3c4 0 5 9 10 9h4M16 16h5v5M4 19h3c2.1 0 3.3-2 4.2-4"></path></svg>'
  };

  const defaultState = {
    favorites: [],
    recents: [],
    lastStation: null,
    volume: 0.8,
    httpsOnly: true,
    bitrateMin: 0,
    sort: 'clickcount',
    query: '',
    country: '',
    tag: '',
    theme: 'dark'
  };

  let persisted = loadState();
  let stations = [];
  let cursor = 0;
  let currentIndex = -1;
  let searchToken = 0;
  let timerId = null;
  let timerEndsAt = null;
  let lastQuery = '';
  let apiBase = API_BASES[0];

  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = clamp(Number(persisted.volume) || 0.8, 0, 1);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      return { ...defaultState, ...JSON.parse(raw) };
    } catch (_) {
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); } catch (_) {}
  }

  function stationKey(station) { return station.stationuuid || station.changeuuid || station.url_resolved || station.url || station.name; }
  function isFavorite(station) { return persisted.favorites.some((s) => stationKey(s) === stationKey(station)); }
  function streamUrl(station) { return station.url_resolved || station.url || ''; }
  function streamIsHttps(station) { return /^https:/i.test(streamUrl(station)); }

  async function fetchJson(path, params = {}, method = 'GET') {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => {
      if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
    });

    const candidates = [apiBase, ...API_BASES.filter((u) => u !== apiBase)];
    let lastError = new Error('Radio service unavailable');
    for (const base of candidates) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const url = `${base}${path}${query.toString() ? `?${query}` : ''}`;
        const response = await fetch(url, {
          method,
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`API ${response.status}`);
        apiBase = base;
        return await response.json();
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }

  function normalizeStation(s) {
    return {
      ...s,
      name: s.name || 'Unnamed station',
      tags: s.tags || '',
      country: s.country || '',
      language: s.language || '',
      codec: s.codec || '',
      bitrate: Number(s.bitrate) || 0,
      favicon: s.favicon || '',
      homepage: s.homepage || '',
      url_resolved: s.url_resolved || s.url || ''
    };
  }

  function dedupe(list) {
    const map = new Map();
    list.forEach((s) => { const key = stationKey(s); if (key && !map.has(key)) map.set(key, normalizeStation(s)); });
    return [...map.values()];
  }

  async function searchStations({ append = false } = {}) {
    const token = ++searchToken;
    const list = $('#station-list');
    if (!append) {
      list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
      cursor = 0;
    }

    const params = {
      name: persisted.query,
      country: persisted.country,
      tag: persisted.tag,
      hidebroken: true,
      order: persisted.sort,
      reverse: persisted.sort !== 'name' ? true : false,
      offset: cursor,
      limit: PAGE_SIZE
    };
    if (persisted.httpsOnly) params.is_https = true;
    if (persisted.bitrateMin) params.bitrateMin = persisted.bitrateMin;

    try {
      let result = await fetchJson('/stations/search', params);
      if (token !== searchToken) return;
      result = dedupe(Array.isArray(result) ? result : []);
      if (!append) stations = result; else stations = dedupe([...stations, ...result]);
      cursor += result.length;
      lastQuery = persisted.query;
      renderStations({ append });
      updateStats();
      setOnlineStatus(true);
    } catch (error) {
      if (token !== searchToken) return;
      if (!append) list.innerHTML = `<div class="empty"><strong>Could not reach Radio Browser</strong>Check your connection, then press Search again.<br><button class="ghost-btn" type="button" data-action="retry" style="margin-top:12px">Retry</button></div>`;
      toast('Radio Browser is temporarily unavailable');
      setOnlineStatus(false);
    }
  }

  async function loadDefault() {
    persisted.query = '';
    persisted.country = '';
    persisted.tag = '';
    $('#search-input').value = '';
    updateFilterLabels();
    await searchStations();
  }

  function renderStations({ append = false } = {}) {
    const list = $('#station-list');
    if (!append) list.innerHTML = '';
    if (!stations.length) {
      list.innerHTML = '<div class="empty"><strong>No stations found</strong>Try a different search, genre, country, or turn off the HTTPS-only filter.</div>';
      return;
    }
    const start = append ? Math.max(0, list.children.length) : 0;
    stations.slice(start).forEach((station, idx) => list.appendChild(stationCard(station, start + idx)));
    $('#load-more').hidden = stations.length < PAGE_SIZE || stations.length % PAGE_SIZE !== 0;
  }

  function stationCard(station, index) {
    const article = document.createElement('article');
    article.className = 'station' + (currentIndex === index && audio.src ? ' playing' : '');
    const key = stationKey(station);
    const tags = station.tags.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 2).join(', ');
    const location = [station.country, station.language].filter(Boolean).slice(0,1).join('');
    const bitrate = station.bitrate ? `${station.bitrate} kbps` : 'live';
    const https = streamIsHttps(station);
    const safeLogo = station.favicon || '';
    article.dataset.key = key;
    article.innerHTML = `
      ${safeLogo ? `<img class="station-logo" loading="lazy" referrerpolicy="no-referrer" alt="" src="${escapeHtml(safeLogo)}">` : `<div class="station-logo fallback">${escapeHtml(station.name.slice(0,1).toUpperCase())}</div>`}
      <div class="station-main">
        <span class="station-name" title="${escapeHtml(station.name)}">${escapeHtml(station.name)}</span>
        <div class="station-meta">
          <span class="meta-chip">${escapeHtml(location || bitrate)}</span>
          <span class="meta-chip">${escapeHtml(tags || bitrate)}</span>
          ${https ? '<span class="meta-chip">HTTPS</span>' : '<span class="meta-chip">HTTP</span>'}
        </div>
      </div>
      <div class="station-actions">
        <button class="fav-btn ${isFavorite(station) ? 'active' : ''}" title="${isFavorite(station) ? 'Remove favorite' : 'Save favorite'}" aria-label="${isFavorite(station) ? 'Remove favorite' : 'Save favorite'}" data-action="favorite" data-key="${escapeHtml(key)}">${icons.heart}</button>
        <button class="play-station" title="Play ${escapeHtml(station.name)}" aria-label="Play ${escapeHtml(station.name)}" data-action="play" data-index="${index}">${icons.play}</button>
      </div>`;
    const img = $('.station-logo', article);
    if (img && img.tagName === 'IMG') img.addEventListener('error', () => { img.outerHTML = `<div class="station-logo fallback">${escapeHtml(station.name.slice(0,1).toUpperCase())}</div>`; }, { once: true });
    return article;
  }

  function renderFavorites() {
    const host = $('#favorites-list');
    if (!persisted.favorites.length) {
      host.innerHTML = '<div class="side-empty">Your saved stations live only in this browser. Tap the heart on any station to pin it here.</div>';
      return;
    }
    host.innerHTML = persisted.favorites.slice(0, 8).map((s) => sideItem(s, 'favorite')).join('');
  }

  function renderRecents() {
    const host = $('#recent-list');
    if (!persisted.recents.length) {
      host.innerHTML = '<div class="side-empty">Stations you play will appear here automatically.</div>';
      return;
    }
    host.innerHTML = persisted.recents.slice(0, 7).map((s) => sideItem(s, 'recent')).join('');
  }

  function sideItem(station, type) {
    const safeLogo = station.favicon || '';
    return `<div class="side-item" data-action="side-play" data-key="${escapeHtml(stationKey(station))}" data-type="${type}">
      ${safeLogo ? `<img class="side-art" loading="lazy" referrerpolicy="no-referrer" alt="" src="${escapeHtml(safeLogo)}">` : '<div class="side-art"></div>'}
      <div><div class="side-name">${escapeHtml(station.name)}</div><div class="side-sub">${escapeHtml([station.country, station.codec, station.bitrate ? `${station.bitrate} kbps` : ''].filter(Boolean).join(' · '))}</div></div>
      ${icons.play}
    </div>`;
  }

  function updateStats() {
    $('#result-count').textContent = stations.length ? `${stations.length}${stations.length >= PAGE_SIZE ? '+' : ''}` : '0';
    $('#fav-count').textContent = String(persisted.favorites.length);
    $('#recent-count').textContent = String(persisted.recents.length);
    $('#api-base').textContent = new URL(apiBase).hostname.replace('.api.radio-browser.info','').replace('all','mirror');
  }

  function setOnlineStatus(online) {
    const dot = $('#online-dot');
    const text = $('#online-text');
    dot.classList.toggle('good', online);
    text.textContent = online ? 'catalog online' : 'offline / retrying';
  }

  function updateFilterLabels() {
    $('#https-only').checked = Boolean(persisted.httpsOnly);
    $('#bitrate').value = String(persisted.bitrateMin);
    $('#sort').value = persisted.sort;
    $('#tag-select').value = persisted.tag;
    $('#country-input').value = persisted.country;
  }

  function setSearchFromControls() {
    persisted.query = $('#search-input').value.trim();
    persisted.country = $('#country-input').value.trim();
    persisted.tag = $('#tag-select').value;
    persisted.httpsOnly = $('#https-only').checked;
    persisted.bitrateMin = Number($('#bitrate').value) || 0;
    persisted.sort = $('#sort').value;
    saveState();
    searchStations();
  }

  function toggleFavoriteByKey(key) {
    const all = [...persisted.favorites];
    const idx = all.findIndex((s) => stationKey(s) === key);
    if (idx >= 0) {
      all.splice(idx, 1);
      toast('Removed from favorites');
    } else {
      const source = stations.find((s) => stationKey(s) === key) || persisted.recents.find((s) => stationKey(s) === key);
      if (!source) return;
      all.unshift(source);
      toast('Saved to favorites');
    }
    persisted.favorites = all.slice(0, 80);
    saveState();
    renderStations();
    renderFavorites();
    updateStats();
  }

  function rememberRecent(station) {
    const key = stationKey(station);
    persisted.recents = [station, ...persisted.recents.filter((s) => stationKey(s) !== key)].slice(0, 25);
    saveState();
    renderRecents();
    updateStats();
  }

  function stationIndexByKey(key) {
    const found = stations.findIndex((s) => stationKey(s) === key);
    if (found >= 0) return found;
    const fromFav = persisted.favorites.find((s) => stationKey(s) === key);
    if (!fromFav) return -1;
    stations = [fromFav, ...stations.filter((s) => stationKey(s) !== key)];
    renderStations();
    return 0;
  }

  function playStation(station, index = stations.findIndex((s) => stationKey(s) === stationKey(station))) {
    const url = streamUrl(station);
    if (!url) { toast('This station has no playable stream'); return; }
    currentIndex = index;
    persisted.lastStation = station;
    rememberRecent(station);
    saveState();
    audio.src = url;
    audio.load();
    audio.play().then(() => {
      setPlayer(station, true);
      renderStations();
      registerClick(station);
    }).catch(() => {
      setPlayer(station, false);
      toast(/^http:/i.test(url) && location.protocol === 'https:' ? 'This HTTP stream is blocked on HTTPS pages' : 'The station could not start playback');
    });
    setPlayer(station, 'loading');
    updateMediaSession(station);
  }

  async function registerClick(station) {
    if (!station.stationuuid) return;
    try { await fetchJson(`/url/${encodeURIComponent(station.stationuuid)}`, {}, 'POST'); } catch (_) {}
  }

  function setPlayer(station, state) {
    document.body.classList.add('player-open');
    $('#player').classList.add('visible');
    $('#player-name').textContent = station.name || 'Radio';
    $('#player-now').textContent = state === 'loading' ? 'Connecting to live stream…' : 'Live broadcast';
    $('#player-play').innerHTML = state === true && !audio.paused ? icons.pause : icons.play;
    $('#player-play').setAttribute('aria-label', state === true && !audio.paused ? 'Pause' : 'Play');
    const art = $('#player-art');
    art.src = station.favicon || '';
    art.alt = station.name || 'Station artwork';
    art.onerror = () => { art.removeAttribute('src'); };
    $('#live-pill').style.display = state === false ? 'none' : 'inline-flex';
  }

  function playCurrent() {
    if (currentIndex < 0 || !stations[currentIndex]) {
      const fallback = persisted.lastStation || persisted.favorites[0] || stations[0];
      if (fallback) playStation(fallback, stationIndexByKey(stationKey(fallback)));
      return;
    }
    if (audio.src && !audio.paused) {
      audio.pause();
      return;
    }
    audio.play().then(() => setPlayer(stations[currentIndex], true)).catch(() => playStation(stations[currentIndex], currentIndex));
  }

  function cycleStation(direction) {
    const pool = stations.length ? stations : persisted.favorites;
    if (!pool.length) return;
    let next = currentIndex + direction;
    if (next < 0) next = pool.length - 1;
    if (next >= pool.length) next = 0;
    currentIndex = next;
    playStation(pool[next], next);
  }

  function randomStation() {
    if (!stations.length) return;
    const index = Math.floor(Math.random() * stations.length);
    playStation(stations[index], index);
  }

  function openTimer() { $('#timer-modal').classList.add('open'); }
  function closeModals() { $$('.modal-backdrop').forEach((m) => m.classList.remove('open')); }

  function setTimer(minutes) {
    clearTimer();
    if (!minutes) { toast('Sleep timer cleared'); closeModals(); return; }
    timerEndsAt = Date.now() + minutes * 60_000;
    timerId = setInterval(() => {
      const remaining = timerEndsAt - Date.now();
      if (remaining <= 0) {
        clearTimer();
        audio.pause();
        toast('Sleep timer ended');
        return;
      }
      $('#timer-badge').textContent = formatRemaining(remaining);
    }, 1000);
    $('#timer-badge').textContent = formatRemaining(minutes * 60_000);
    closeModals();
    toast(`Sleep timer: ${minutes} min`);
  }

  function clearTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
    timerEndsAt = null;
    $('#timer-badge').textContent = '—';
  }

  function formatRemaining(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}:${String(seconds).padStart(2,'0')}` : `${seconds}s`;
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function updateMediaSession(station) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: station.name || 'Radio', artist: [station.country, station.tags].filter(Boolean).join(' · '), album: 'Radio Browser', artwork: station.favicon ? [{ src: station.favicon, sizes: '96x96', type: 'image/png' }] : [] });
      navigator.mediaSession.setActionHandler('play', () => audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => cycleStation(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => cycleStation(1));
    } catch (_) {}
  }

  function exportFavorites() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), favorites: persisted.favorites }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'radio-favorites.json'; a.click();
    URL.revokeObjectURL(url);
    toast('Favorites exported');
  }

  function importFavorites(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const imported = Array.isArray(parsed) ? parsed : parsed.favorites;
        if (!Array.isArray(imported)) throw new Error('Invalid file');
        persisted.favorites = dedupe([...imported, ...persisted.favorites]).slice(0, 80);
        saveState(); renderFavorites(); renderStations(); updateStats();
        toast(`Imported ${imported.length} favorites`);
      } catch (_) { toast('That file is not a Radio favorites export'); }
    };
    reader.readAsText(file);
  }

  function populateGenres() {
    $('#tag-select').innerHTML = '<option value="">All genres</option>' + GENRES.map((g) => `<option value="${escapeHtml(g.toLowerCase())}">${escapeHtml(g)}</option>`).join('');
  }

  function initEvents() {
    $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); setSearchFromControls(); });
    $('#reset-filters').addEventListener('click', () => loadDefault());
    $('#load-more').addEventListener('click', () => searchStations({ append: true }));
    $('#random-btn').addEventListener('click', randomStation);
    $('#settings-btn').addEventListener('click', () => $('#settings-modal').classList.add('open'));
    $('#timer-btn').addEventListener('click', openTimer);
    $('#player-play').addEventListener('click', playCurrent);
    $('#player-prev').addEventListener('click', () => cycleStation(-1));
    $('#player-next').addEventListener('click', () => cycleStation(1));
    $('#volume').addEventListener('input', (e) => { audio.volume = Number(e.target.value); persisted.volume = audio.volume; saveState(); });
    $('#https-only').addEventListener('change', setSearchFromControls);
    $('#bitrate').addEventListener('change', setSearchFromControls);
    $('#sort').addEventListener('change', setSearchFromControls);
    $('#tag-select').addEventListener('change', setSearchFromControls);
    $('#country-input').addEventListener('change', setSearchFromControls);
    $('#clear-recents').addEventListener('click', () => { persisted.recents = []; saveState(); renderRecents(); updateStats(); toast('History cleared'); });
    $('#export-favorites').addEventListener('click', exportFavorites);
    $('#import-favorites').addEventListener('change', (e) => importFavorites(e.target.files[0]));
    $('#last-station').addEventListener('click', () => { if (persisted.lastStation) playStation(persisted.lastStation, stationIndexByKey(stationKey(persisted.lastStation))); });

    document.addEventListener('click', (event) => {
      const actionEl = event.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === 'favorite') { event.preventDefault(); toggleFavoriteByKey(actionEl.dataset.key); }
      else if (action === 'play') { playStation(stations[Number(actionEl.dataset.index)], Number(actionEl.dataset.index)); }
      else if (action === 'side-play') {
        const source = actionEl.dataset.type === 'favorite' ? persisted.favorites : persisted.recents;
        const station = source.find((s) => stationKey(s) === actionEl.dataset.key);
        if (station) playStation(station, stationIndexByKey(actionEl.dataset.key));
      } else if (action === 'retry') searchStations();
    });

    $$('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModals(); }));
    $$('[data-close-modal]').forEach((btn) => btn.addEventListener('click', closeModals));
    $$('.timer-choice').forEach((btn) => btn.addEventListener('click', () => setTimer(Number(btn.dataset.minutes))));

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input,select,textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); playCurrent(); }
      if (e.key === 'ArrowRight') cycleStation(1);
      if (e.key === 'ArrowLeft') cycleStation(-1);
      if (e.key.toLowerCase() === 'r') randomStation();
      if (e.key === 'Escape') closeModals();
    });

    audio.addEventListener('playing', () => { if (currentIndex >= 0 && stations[currentIndex]) setPlayer(stations[currentIndex], true); renderStations(); });
    audio.addEventListener('pause', () => { if (currentIndex >= 0 && stations[currentIndex]) setPlayer(stations[currentIndex], false); renderStations(); });
    audio.addEventListener('waiting', () => { if (currentIndex >= 0 && stations[currentIndex]) setPlayer(stations[currentIndex], 'loading'); });
    audio.addEventListener('error', () => { if (currentIndex >= 0 && stations[currentIndex]) toast('Stream disconnected — try another station'); });
    audio.addEventListener('volumechange', () => { $('#volume').value = String(audio.volume); });
    window.addEventListener('beforeunload', saveState);
  }

  function init() {
    populateGenres();
    $('#volume').value = String(audio.volume);
    $('#https-only').checked = persisted.httpsOnly;
    $('#bitrate').value = String(persisted.bitrateMin);
    $('#sort').value = persisted.sort;
    $('#country-input').value = persisted.country;
    $('#search-input').value = persisted.query;
    $('#tag-select').value = persisted.tag;
    updateStats();
    renderFavorites();
    renderRecents();
    initEvents();
    updateMediaSession(persisted.lastStation || { name: 'Radio' });
    if (persisted.lastStation) {
      $('#last-station').hidden = false;
      $('#last-station-name').textContent = persisted.lastStation.name;
    }
    loadDefault();
  }

  window.RadioApp = { playStation, randomStation, searchStations };
  init();
})();
