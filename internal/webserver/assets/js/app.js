// OpenHongguo Web & Windows Desktop Client Frontend
(function () {
  'use strict';

  // State
  const state = {
    channel: '推荐',
    cursor: '',
    hasMore: false,
    searchQuery: '',
    searchFilter: '',
    seriesItems: [],
    isLoadingCatalog: false,

    currentSeries: null,
    episodes: [],
    currentEpIndex: 0,
    currentQuality: '720p',
    autoplay: true,

    history: [],
    tools: {},
    historyOpen: false,
    cachedEpIDs: new Set(),
    cacheWindowTimer: null,
    loadingTimer: null,
  };

  // DOM Elements
  const el = {
    viewCatalog: document.getElementById('view-catalog'),
    viewTheater: document.getElementById('view-theater'),
    seriesGrid: document.getElementById('series-grid'),
    btnLoadMore: document.getElementById('btn-load-more'),
    gridLoader: document.getElementById('grid-loader'),
    gridEmpty: document.getElementById('grid-empty'),
    channelTitle: document.getElementById('current-channel-title'),
    channelSubtitle: document.getElementById('channel-subtitle'),
    catalogFilters: document.getElementById('catalog-filters'),

    navChannels: document.getElementById('nav-channels'),
    searchInput: document.getElementById('search-input'),
    searchClear: document.getElementById('search-clear'),
    searchSubmit: document.getElementById('search-submit'),
    btnHome: document.getElementById('btn-home'),

    btnHistoryToggle: document.getElementById('btn-history-toggle'),
    historyDrawer: document.getElementById('history-drawer'),
    drawerOverlay: document.getElementById('drawer-overlay'),
    btnCloseHistory: document.getElementById('btn-close-history'),
    btnClearHistory: document.getElementById('btn-clear-history'),
    historyList: document.getElementById('history-list'),

    systemStatus: document.getElementById('system-status-indicator'),

    // Player Elements
    video: document.getElementById('video-element'),
    videoLoading: document.getElementById('video-loading'),
    videoLoadingMsg: document.getElementById('video-loading-msg'),
    playerTitle: document.getElementById('player-title'),
    btnPlayerBack: document.getElementById('btn-player-back'),
    btnEpPrev: document.getElementById('btn-ep-prev'),
    btnEpNext: document.getElementById('btn-ep-next'),
    chkAutoplay: document.getElementById('chk-autoplay'),
    selectQuality: document.getElementById('select-quality'),
    btnPlayExternal: document.getElementById('btn-play-external'),
    btnDownloadEp: document.getElementById('btn-download-ep'),

    theaterSeriesCover: document.getElementById('theater-series-cover'),
    theaterSeriesTitle: document.getElementById('theater-series-title'),
    theaterEpCount: document.getElementById('theater-ep-count'),
    theaterHeat: document.getElementById('theater-heat'),
    theaterSeriesTags: document.getElementById('theater-series-tags'),
    theaterSeriesSummary: document.getElementById('theater-series-summary'),
    epTotalLabel: document.getElementById('ep-total-label'),
    cacheStatusBar: document.getElementById('cache-status-bar'),
    cacheStatusText: document.getElementById('cache-status-text'),
    epRangeTabs: document.getElementById('ep-range-tabs'),
    episodesGrid: document.getElementById('episodes-grid'),

    toastContainer: document.getElementById('toast-container'),
  };

  // === Utilities ===
  function showToast(msg, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  function formatHeat(num) {
    if (!num) return '0';
    if (num > 10000000) return (num / 10000000).toFixed(1) + '千万';
    if (num > 10000) return (num / 10000).toFixed(1) + '万';
    return num.toString();
  }

  function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    return `${Math.floor(diff / 86400)} 天前`;
  }

  // === API Client ===
  async function apiGet(endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try {
        const j = JSON.parse(text);
        if (j.error) msg = j.error;
      } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function apiPost(endpoint, body) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try {
        const j = JSON.parse(text);
        if (j.error) msg = j.error;
      } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  }

  // === Init & System Status ===
  async function initSystem() {
    try {
      const data = await apiGet('/api/system/status');
      state.tools = data.tools || {};
      const dot = el.systemStatus.querySelector('.status-dot');
      const text = el.systemStatus.querySelector('.status-text');

      if (state.tools.ffmpeg_ready) {
        dot.className = 'status-dot online';
        text.textContent = 'FFmpeg 就绪';
        el.systemStatus.title = `FFmpeg: ${state.tools.ffmpeg_path || '已就绪'}\n桌面模式: ${state.tools.desktop_mode ? '支持' : '不支持'}`;
      } else {
        dot.className = 'status-dot';
        text.textContent = '无解密工具';
        el.systemStatus.title = '未检测到 FFmpeg，受保护视频可能需使用外部播放器';
      }
    } catch (e) {
      console.warn('System status fetch failed:', e);
    }
  }

  // === Catalog Loading ===
  async function loadCatalog(reset = false) {
    if (state.isLoadingCatalog) return;
    state.isLoadingCatalog = true;

    if (reset) {
      state.cursor = '';
      state.seriesItems = [];
      el.seriesGrid.innerHTML = '';
      el.gridEmpty.style.display = 'none';
    }

    el.gridLoader.style.display = 'flex';
    el.btnLoadMore.style.display = 'none';

    try {
      let page;
      if (state.searchQuery) {
        const url = `/api/search?q=${encodeURIComponent(state.searchQuery)}&cursor=${encodeURIComponent(state.cursor || '')}&filter=${encodeURIComponent(state.searchFilter || '')}`;
        page = await apiGet(url);
      } else {
        const url = `/api/discover?channel=${encodeURIComponent(state.channel)}&cursor=${encodeURIComponent(state.cursor || '')}`;
        page = await apiGet(url);
      }

      const items = page.items || [];
      state.cursor = page.cursor || '';
      state.hasMore = page.has_more || (page.cursor && page.cursor !== '');

      if (reset && items.length === 0) {
        el.gridEmpty.style.display = 'flex';
      } else {
        el.gridEmpty.style.display = 'none';
        renderSeriesCards(items);
      }

      if (state.hasMore && items.length > 0) {
        el.btnLoadMore.style.display = 'block';
      } else {
        el.btnLoadMore.style.display = 'none';
      }
    } catch (err) {
      showToast('加载失败: ' + err.message, 'error');
      if (state.seriesItems.length === 0) {
        el.gridEmpty.style.display = 'flex';
      }
    } finally {
      state.isLoadingCatalog = false;
      el.gridLoader.style.display = 'none';
    }
  }

  function renderSeriesCards(items) {
    items.forEach((item) => {
      state.seriesItems.push(item);
      const card = document.createElement('div');
      card.className = 'series-card';
      card.onclick = () => openSeries(item.id);

      const coverUrl = item.cover_url || '';
      const epLabel = item.episode_count ? `全${item.episode_count}集` : '';
      const heat = item.heat ? `🔥 ${formatHeat(item.heat)}` : '';
      const tags = (item.tags || []).slice(0, 2).map((t) => `<span class="card-tag">${t}</span>`).join('');

      card.innerHTML = `
        <div class="card-poster-wrapper">
          <img class="card-poster" src="${coverUrl}" alt="${item.title || '短剧'}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 400%22><rect width=%22300%22 height=%22400%22 fill=%22%23222%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23888%22 font-size=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>红果短剧</text></svg>'">
          ${epLabel ? `<span class="card-badge-top">${epLabel}</span>` : ''}
          ${item.status === 0 ? `<span class="card-badge-bottom">连载中</span>` : ''}
        </div>
        <div class="card-info">
          <h3 class="card-title" title="${item.title || ''}">${item.title || '未知剧名'}</h3>
          <div class="card-meta-row">
            <div class="card-tags">${tags}</div>
            <span class="card-heat">${heat}</span>
          </div>
        </div>
      `;
      el.seriesGrid.appendChild(card);
    });
  }

  // === Open Series & Theater Mode ===
  async function openSeries(seriesId, targetEpNum = 1) {
    switchToTheater();
    el.videoLoading.style.display = 'flex';
    el.videoLoadingMsg.textContent = '正在获取短剧信息与选集...';

    try {
      // 1. Get Series Detail & Episodes in parallel
      const [series, epPage] = await Promise.all([
        apiGet(`/api/series?id=${encodeURIComponent(seriesId)}`),
        apiGet(`/api/episodes?id=${encodeURIComponent(seriesId)}`),
      ]);

      state.currentSeries = series;
      state.episodes = epPage.items || [];

      // Update meta in UI
      el.theaterSeriesCover.src = series.cover_url || '';
      el.theaterSeriesTitle.textContent = series.title || '短剧';
      el.theaterEpCount.textContent = series.episode_count ? `全${series.episode_count}集` : `共${state.episodes.length}集`;
      el.theaterHeat.textContent = series.heat ? `热度 ${formatHeat(series.heat)}` : '';
      el.theaterSeriesSummary.textContent = series.summary || '暂无剧情简介。';

      // Tags
      el.theaterSeriesTags.innerHTML = (series.tags || [])
        .map((t) => `<span class="stat-badge">${t}</span>`)
        .join('');

      el.epTotalLabel.textContent = `共 ${state.episodes.length} 集`;

      // Check history to resume
      let resumeSeconds = 0;
      let startEpIndex = 0;

      // Find matching history
      const historyItem = state.history.find((h) => h.series_id === seriesId);
      if (historyItem && !targetEpNum) {
        const foundIdx = state.episodes.findIndex((e) => e.number === historyItem.episode);
        if (foundIdx !== -1) {
          startEpIndex = foundIdx;
          resumeSeconds = historyItem.finished ? 0 : historyItem.position || 0;
          showToast(`已为您定位至上次观看的第 ${historyItem.episode} 集`, 'info');
        }
      } else if (targetEpNum) {
        const foundIdx = state.episodes.findIndex((e) => e.number === targetEpNum);
        if (foundIdx !== -1) startEpIndex = foundIdx;
      }

      renderEpisodeRangeTabs();
      loadEpisode(startEpIndex, true, resumeSeconds);
    } catch (err) {
      showToast('加载短剧详情失败: ' + err.message, 'error');
      el.videoLoadingMsg.textContent = '加载失败: ' + err.message;
    }
  }

  // === Episode Range Tabs & Grid ===
  function renderEpisodeRangeTabs() {
    const total = state.episodes.length;
    const chunkSize = 30;
    el.epRangeTabs.innerHTML = '';

    if (total <= chunkSize) {
      el.epRangeTabs.style.display = 'none';
      renderEpisodeButtons(0, total);
      return;
    }

    el.epRangeTabs.style.display = 'flex';
    const numChunks = Math.ceil(total / chunkSize);

    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize + 1;
      const end = Math.min((i + 1) * chunkSize, total);
      const tab = document.createElement('button');
      tab.className = `ep-range-tab ${i === Math.floor(state.currentEpIndex / chunkSize) ? 'active' : ''}`;
      tab.textContent = `${start}-${end}`;
      tab.onclick = () => {
        el.epRangeTabs.querySelectorAll('.ep-range-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        renderEpisodeButtons(i * chunkSize, end);
      };
      el.epRangeTabs.appendChild(tab);
    }

    const activeChunk = Math.floor(state.currentEpIndex / chunkSize);
    renderEpisodeButtons(activeChunk * chunkSize, Math.min((activeChunk + 1) * chunkSize, total));
  }

  function renderEpisodeButtons(startIndex, endIndex) {
    el.episodesGrid.innerHTML = '';
    const slice = state.episodes.slice(startIndex, endIndex);

    slice.forEach((ep, idx) => {
      const realIndex = startIndex + idx;
      const btn = document.createElement('button');
      const isCached = state.cachedEpIDs && state.cachedEpIDs.has(ep.id);
      btn.className = `ep-btn ${realIndex === state.currentEpIndex ? 'active' : ''} ${isCached ? 'cached' : ''}`;
      btn.textContent = ep.number || (realIndex + 1);
      const cachedTip = isCached ? ' (已本地缓存 秒播)' : '';
      btn.title = `第 ${ep.number} 集${ep.title ? ' - ' + ep.title : ''}${cachedTip}`;
      btn.onclick = () => loadEpisode(realIndex, true);
      el.episodesGrid.appendChild(btn);
    });
  }

  function updateActiveEpisodeButton() {
    el.episodesGrid.querySelectorAll('.ep-btn').forEach((btn, idx) => {
      const epNum = parseInt(btn.textContent, 10);
      btn.classList.toggle('active', epNum === (state.currentEpIndex + 1));
      const ep = state.episodes.find(e => e.number === epNum);
      if (ep && state.cachedEpIDs && state.cachedEpIDs.has(ep.id)) {
        btn.classList.add('cached');
      }
    });
  }

  async function notifyActiveCache(ep) {
    if (!state.currentSeries) return;
    try {
      const payload = {
        series_id: state.currentSeries.id,
        episode_id: ep.id,
        quality: state.currentQuality,
        episodes: state.episodes.map(e => ({ id: e.id, number: e.number, title: e.title })),
      };
      const res = await apiPost('/api/cache/active', payload);
      updateCacheWindowUI(res);
      if (res.last_event === 'jump_cleared_refilling') {
        showToast(`已跳级至第 ${ep.number} 集，已清空并重置后10集预载窗口`, 'info', 2200);
      }
    } catch (e) {
      console.warn('Cache window activate failed:', e);
    }
  }

  function updateCacheWindowUI(res) {
    if (!res) return;
    state.cachedEpIDs = new Set(res.cached_ep_ids || []);
    if (el.cacheStatusText) {
      const prefetchStr = res.is_prefetching ? ' (⚡正在缓存后10集...)' : ' (已就绪)';
      el.cacheStatusText.textContent = `智能缓存: 已缓存 ${res.total_cached || 0}/${res.max_cached || 12} 集${prefetchStr}`;
    }
    // Update episode buttons cached indicator
    el.episodesGrid.querySelectorAll('.ep-btn').forEach(btn => {
      const epNum = parseInt(btn.textContent, 10);
      const ep = state.episodes.find(e => e.number === epNum);
      if (ep && state.cachedEpIDs.has(ep.id)) {
        btn.classList.add('cached');
        btn.title = `第 ${ep.number} 集 (已本地缓存 秒播)`;
      } else {
        btn.classList.remove('cached');
      }
    });
  }

  async function pollCacheWindow() {
    if (!state.currentSeries || el.viewTheater.style.display === 'none') return;
    try {
      const res = await apiGet(`/api/cache/window?series_id=${encodeURIComponent(state.currentSeries.id)}&quality=${encodeURIComponent(state.currentQuality)}`);
      updateCacheWindowUI(res);
    } catch (e) {}
  }

  // === Load Episode & Video Playback ===
  async function loadEpisode(index, autoPlay = true, resumeSeconds = 0) {
    if (index < 0 || index >= state.episodes.length) return;

    state.currentEpIndex = index;
    const ep = state.episodes[index];
    const series = state.currentSeries;

    el.playerTitle.textContent = `第 ${ep.number} 集 - ${series ? series.title : ''}`;

    // Debounce loading indicator: only show if loading takes > 250ms (avoids black flicker on cached video)
    if (state.loadingTimer) {
      clearTimeout(state.loadingTimer);
      state.loadingTimer = null;
    }
    state.loadingTimer = setTimeout(() => {
      el.videoLoading.style.display = 'flex';
      el.videoLoadingMsg.textContent = `正在准备第 ${ep.number} 集流媒体与解密...`;
    }, 250);

    // Stream URL with series_id context for sliding window
    const streamUrl = `/api/stream?episode_id=${encodeURIComponent(ep.id)}&series_id=${encodeURIComponent(series ? series.id : '')}&quality=${encodeURIComponent(state.currentQuality)}`;

    el.video.pause();
    el.video.src = streamUrl;

    // Trigger sliding window active cache (cache upcoming 10 episodes, keep <= 12)
    notifyActiveCache(ep);

    const onLoaded = () => {
      el.video.removeEventListener('loadedmetadata', onLoaded);
      if (state.loadingTimer) {
        clearTimeout(state.loadingTimer);
        state.loadingTimer = null;
      }
      el.videoLoading.style.display = 'none';

      if (resumeSeconds > 0 && resumeSeconds < el.video.duration - 5) {
        el.video.currentTime = resumeSeconds;
        showToast(`已恢复至 ${Math.floor(resumeSeconds / 60)}分${Math.floor(resumeSeconds % 60)}秒 继续播放`, 'info');
      }

      if (autoPlay) {
        el.video.play().catch((err) => {
          console.warn('Autoplay restricted by browser, click play:', err);
        });
      }
    };

    el.video.addEventListener('loadedmetadata', onLoaded);

    el.video.onerror = () => {
      if (state.loadingTimer) {
        clearTimeout(state.loadingTimer);
        state.loadingTimer = null;
      }
      el.videoLoading.style.display = 'flex';
      el.videoLoadingMsg.textContent = '视频流加载异常，如为 DRM 加密剧请确保系统已安装 FFmpeg';
      showToast('视频加载出错，可在右侧尝试切换画质或使用外部播放器', 'error');
    };

    // Update buttons
    el.btnEpPrev.disabled = index <= 0;
    el.btnEpNext.disabled = index >= state.episodes.length - 1;
    updateActiveEpisodeButton();

    // Auto switch range tab if needed
    const chunkSize = 30;
    const chunkIdx = Math.floor(index / chunkSize);
    const tabs = el.epRangeTabs.querySelectorAll('.ep-range-tab');
    if (tabs[chunkIdx] && !tabs[chunkIdx].classList.contains('active')) {
      tabs.forEach((t) => t.classList.remove('active'));
      tabs[chunkIdx].classList.add('active');
      renderEpisodeButtons(chunkIdx * chunkSize, Math.min((chunkIdx + 1) * chunkSize, state.episodes.length));
    }

    saveCurrentHistory(false);
  }

  // === Save History Record ===
  async function saveCurrentHistory(finished = false) {
    if (!state.currentSeries || !state.episodes[state.currentEpIndex]) return;
    const series = state.currentSeries;
    const ep = state.episodes[state.currentEpIndex];

    const entry = {
      series_id: series.id,
      title: series.title,
      episode: ep.number,
      episodes: state.episodes.length,
      finished: finished,
      position: el.video ? el.video.currentTime || 0 : 0,
      updated_at: new Date().toISOString(),
    };

    try {
      await apiPost('/api/history', entry);
      // Update local history cache
      const existing = state.history.findIndex((h) => h.series_id === series.id);
      if (existing !== -1) {
        state.history[existing] = entry;
      } else {
        state.history.unshift(entry);
      }
    } catch (e) {
      console.warn('Save history failed:', e);
    }
  }

  // === View Switching ===
  function switchToTheater() {
    el.viewCatalog.style.display = 'none';
    el.viewTheater.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!state.cacheWindowTimer) {
      pollCacheWindow();
      state.cacheWindowTimer = setInterval(pollCacheWindow, 2500);
    }
  }

  function switchToCatalog() {
    if (state.loadingTimer) {
      clearTimeout(state.loadingTimer);
      state.loadingTimer = null;
    }
    el.videoLoading.style.display = 'none';
    el.video.pause();
    el.viewTheater.style.display = 'none';
    el.viewCatalog.style.display = 'block';
    if (state.cacheWindowTimer) {
      clearInterval(state.cacheWindowTimer);
      state.cacheWindowTimer = null;
    }
  }

  // === History Drawer ===
  async function openHistory() {
    state.historyOpen = true;
    el.historyDrawer.classList.add('open');
    el.drawerOverlay.classList.add('open');
    renderHistoryList();
    try {
      const data = await apiGet('/api/history');
      state.history = data || [];
      renderHistoryList();
    } catch (e) {}
  }

  function closeHistory() {
    state.historyOpen = false;
    el.historyDrawer.classList.remove('open');
    el.drawerOverlay.classList.remove('open');
  }

  function renderHistoryList() {
    el.historyList.innerHTML = '';
    if (!state.history || state.history.length === 0) {
      el.historyList.innerHTML = `<div class="empty-state"><p>暂无观看历史记录</p></div>`;
      return;
    }

    state.history.forEach((h) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.onclick = () => {
        closeHistory();
        openSeries(h.series_id, h.episode);
      };

      const progress = h.finished ? '已看完本集' : `看到第 ${h.episode} 集 (已看 ${Math.floor((h.position || 0) / 60)}分)`;
      item.innerHTML = `
        <div class="history-item-info">
          <div class="history-title" title="${h.title || ''}">${h.title || '未知剧名'}</div>
          <div class="history-ep">${progress}</div>
          <div class="history-time">${formatTimeAgo(h.updated_at)}</div>
        </div>
      `;
      el.historyList.appendChild(item);
    });
  }

  // === Event Listeners ===
  function setupEventListeners() {
    // Channel tabs
    el.navChannels.addEventListener('click', (e) => {
      const tab = e.target.closest('.nav-tab');
      if (!tab) return;
      el.navChannels.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      state.channel = tab.dataset.channel;
      state.searchQuery = '';
      el.searchInput.value = '';
      el.searchClear.style.display = 'none';
      el.catalogFilters.style.display = 'none';
      el.channelTitle.textContent = `${tab.textContent}短剧`;
      el.channelSubtitle.textContent = `实时更新「${tab.textContent}」分类`;

      switchToCatalog();
      loadCatalog(true);
    });

    // Brand / Home
    el.btnHome.onclick = () => {
      state.searchQuery = '';
      el.searchInput.value = '';
      el.searchClear.style.display = 'none';
      el.catalogFilters.style.display = 'none';
      const firstTab = el.navChannels.querySelector('.nav-tab');
      if (firstTab) firstTab.click();
    };

    // Search
    const triggerSearch = () => {
      const q = el.searchInput.value.trim();
      if (!q) return;
      state.searchQuery = q;
      el.searchClear.style.display = 'block';
      el.catalogFilters.style.display = 'flex';
      el.navChannels.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
      el.channelTitle.textContent = `🔍 搜索结果: “${q}”`;
      el.channelSubtitle.textContent = `找到的相关短剧`;

      switchToCatalog();
      loadCatalog(true);
    };

    el.searchSubmit.onclick = triggerSearch;
    el.searchInput.onkeydown = (e) => {
      if (e.key === 'Enter') triggerSearch();
    };

    el.searchInput.oninput = () => {
      el.searchClear.style.display = el.searchInput.value ? 'block' : 'none';
    };

    el.searchClear.onclick = () => {
      el.searchInput.value = '';
      el.searchClear.style.display = 'none';
      el.btnHome.click();
    };

    // Filter Chips
    el.catalogFilters.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      el.catalogFilters.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.searchFilter = chip.dataset.filter;
      loadCatalog(true);
    });

    // Load More
    el.btnLoadMore.onclick = () => loadCatalog(false);

    // Back to catalog from theater
    el.btnPlayerBack.onclick = switchToCatalog;

    // Prev / Next Episode
    el.btnEpPrev.onclick = () => loadEpisode(state.currentEpIndex - 1, true);
    el.btnEpNext.onclick = () => loadEpisode(state.currentEpIndex + 1, true);

    // Autoplay toggle
    el.chkAutoplay.onchange = () => {
      state.autoplay = el.chkAutoplay.checked;
      showToast(state.autoplay ? '自动连播已开启' : '自动连播已关闭', 'info');
    };

    // Quality selector
    el.selectQuality.onchange = () => {
      state.currentQuality = el.selectQuality.value;
      const curTime = el.video.currentTime || 0;
      showToast(`切换清晰度至 ${state.currentQuality}`, 'info');
      loadEpisode(state.currentEpIndex, true, curTime);
    };

    // Download Episode
    el.btnDownloadEp.onclick = () => {
      const ep = state.episodes[state.currentEpIndex];
      const series = state.currentSeries;
      if (!ep) return;
      const fileName = `${series ? series.title : '短剧'}_第${ep.number}集.mp4`;
      const url = `/api/download?episode_id=${encodeURIComponent(ep.id)}&quality=${encodeURIComponent(state.currentQuality)}&filename=${encodeURIComponent(fileName)}`;
      showToast('正在开始下载本集...', 'success');
      window.open(url, '_blank');
    };

    // Play in external player (FFplay / MPV / VLC)
    el.btnPlayExternal.onclick = async () => {
      const ep = state.episodes[state.currentEpIndex];
      if (!ep) return;
      const startSec = Math.floor(el.video.currentTime || 0);
      try {
        el.video.pause();
        showToast('正在调用本地独立播放器...', 'info');
        const res = await apiPost('/api/play_external', {
          episode_id: ep.id,
          quality: state.currentQuality,
          start_seconds: startSec,
        });
        showToast(`已使用 ${res.player || '系统播放器'} 打开！`, 'success');
      } catch (err) {
        showToast('外部播放器启动失败: ' + err.message, 'error');
      }
    };

    // Video events
    el.video.addEventListener('ended', () => {
      saveCurrentHistory(true);
      if (state.autoplay) {
        if (state.currentEpIndex < state.episodes.length - 1) {
          const nextEp = state.episodes[state.currentEpIndex + 1];
          showToast(`正在播放第 ${nextEp ? nextEp.number : state.currentEpIndex + 2} 集`, 'info', 1200);
          loadEpisode(state.currentEpIndex + 1, true);
        } else {
          showToast('全剧已播放完毕！', 'success');
        }
      }
    });

    // Periodic history save on time update (throttled every 6s)
    let lastSave = 0;
    el.video.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - lastSave > 6000) {
        lastSave = now;
        saveCurrentHistory(false);
      }
    });

    // History Drawer Events
    el.btnHistoryToggle.onclick = openHistory;
    el.btnCloseHistory.onclick = closeHistory;
    el.drawerOverlay.onclick = closeHistory;

    el.btnClearHistory.onclick = async () => {
      if (!confirm('确定清空所有观看历史记录吗？')) return;
      try {
        await fetch('/api/history', { method: 'DELETE' });
        state.history = [];
        renderHistoryList();
        showToast('历史记录已清空', 'info');
      } catch (e) {
        showToast('清空失败: ' + e.message, 'error');
      }
    };

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Ignore if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (el.viewTheater.style.display !== 'none') {
        switch (e.key) {
          case ' ':
          case 'k':
          case 'K':
            e.preventDefault();
            if (el.video.paused) el.video.play();
            else el.video.pause();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            el.video.currentTime = Math.max(0, el.video.currentTime - 5);
            break;
          case 'ArrowRight':
            e.preventDefault();
            el.video.currentTime = Math.min(el.video.duration || 9999, el.video.currentTime + 5);
            break;
          case '[':
            el.btnEpPrev.click();
            break;
          case ']':
            el.btnEpNext.click();
            break;
          case 'f':
          case 'F':
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else if (el.video.requestFullscreen) {
              el.video.requestFullscreen();
            }
            break;
          case 'Escape':
            if (state.historyOpen) closeHistory();
            break;
        }
      }
    });
  }

  // === Boot ===
  async function boot() {
    setupEventListeners();
    await initSystem();
    // Preload history
    try {
      const hData = await apiGet('/api/history');
      state.history = hData || [];
    } catch (e) {}

    // Initial catalog load
    loadCatalog(true);
  }

  boot();
})();
