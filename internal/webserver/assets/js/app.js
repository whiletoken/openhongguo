// OpenHongguo Web - Application Entrypoint & Event Coordinator

import { state, el } from './state.js';
import { apiGet, apiPost } from './api.js';
import { showToast } from './utils.js';
import {
  loadSearchHistory,
  addSearchHistory,
  clearSearchHistory,
  showSearchHistory,
  hideSearchHistory,
  setSearchCallback,
} from './search_history.js';
import {
  loadCatalogPage,
  loadCatalog,
  setOpenSeriesHandler as setCatalogOpenSeriesHandler,
} from './catalog.js';
import {
  openSeries,
  loadEpisode,
  switchToCatalog,
  getArtPlayer,
} from './player.js';
import {
  openHistory,
  closeHistory,
  clearHistory,
  setOpenSeriesHandler as setHistoryOpenSeriesHandler,
} from './history.js';

// === Connect Subsystems ===
setCatalogOpenSeriesHandler(openSeries);
setHistoryOpenSeriesHandler(openSeries);

// === System Status ===
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

// === Search Coordination ===
function triggerSearch(keyword) {
  const q = (keyword || el.searchInput.value).trim();
  if (!q) return;
  addSearchHistory(q);
  hideSearchHistory();
  state.searchQuery = q;
  el.searchClear.style.display = 'block';
  el.catalogFilters.style.display = 'flex';
  el.navChannels.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
  el.channelTitle.textContent = `🔍 搜索结果: “${q}”`;
  el.channelSubtitle.textContent = `找到的相关短剧`;

  switchToCatalog();
  loadCatalog(true);
}
setSearchCallback(triggerSearch);

// === Event Listeners Setup ===
function setupEventListeners() {
  // Channel navigation tabs
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

  // Brand / Home button
  el.btnHome.onclick = () => {
    state.searchQuery = '';
    el.searchInput.value = '';
    el.searchClear.style.display = 'none';
    el.catalogFilters.style.display = 'none';
    const firstTab = el.navChannels.querySelector('.nav-tab');
    if (firstTab) firstTab.click();
  };

  // Search input events
  el.searchSubmit.onclick = () => triggerSearch();
  el.searchInput.onkeydown = (e) => {
    if (e.key === 'Enter') triggerSearch();
  };
  el.searchInput.onfocus = () => showSearchHistory();
  el.searchInput.onclick = (e) => {
    e.stopPropagation();
    showSearchHistory();
  };
  el.searchInput.oninput = () => {
    el.searchClear.style.display = el.searchInput.value ? 'block' : 'none';
    if (!el.searchInput.value) {
      showSearchHistory();
    } else {
      hideSearchHistory();
    }
  };
  el.searchClear.onclick = () => {
    el.searchInput.value = '';
    el.searchClear.style.display = 'none';
    hideSearchHistory();
    el.btnHome.click();
  };
  if (el.btnClearSearchHistory) {
    el.btnClearSearchHistory.onclick = (e) => {
      e.stopPropagation();
      clearSearchHistory();
    };
  }

  // Hide search history on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.header-search')) {
      hideSearchHistory();
    }
  });

  // Filter chips in search mode
  el.catalogFilters.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    el.catalogFilters.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.searchFilter = chip.dataset.filter;
    loadCatalog(true);
  });

  // Cursor pagination controls
  if (el.btnPagePrev) {
    el.btnPagePrev.onclick = () => {
      if (state.isLoadingCatalog) return;
      if (state.currentPage > 1) {
        loadCatalogPage(state.currentPage - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
  }
  if (el.btnPageNext) {
    el.btnPageNext.onclick = () => {
      if (state.isLoadingCatalog) return;
      const curData = state.pageStack[state.currentPage - 1];
      if (curData && curData.hasMore && curData.cursor && curData.cursor.trim()) {
        loadCatalogPage(state.currentPage + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
  }

  // Back to catalog from theater
  el.btnPlayerBack.onclick = switchToCatalog;

  // Prev / Next Episode buttons
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
    const art = getArtPlayer();
    const curTime = (art && art.currentTime) ? art.currentTime : 0;
    showToast(`切换清晰度至 ${state.currentQuality}`, 'info');
    loadEpisode(state.currentEpIndex, true, curTime);
  };

  // Download current episode
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
    const art = getArtPlayer();
    const startSec = Math.floor((art && art.currentTime) ? art.currentTime : 0);
    try {
      if (art) art.pause();
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

  // History Drawer
  el.btnHistoryToggle.onclick = openHistory;
  el.btnCloseHistory.onclick = closeHistory;
  el.drawerOverlay.onclick = closeHistory;
  el.btnClearHistory.onclick = clearHistory;

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        hideSearchHistory();
        e.target.blur();
      }
      return;
    }

    if (e.key === 'Escape') {
      if (el.searchHistoryDropdown && el.searchHistoryDropdown.style.display !== 'none') {
        hideSearchHistory();
        return;
      }
      if (state.historyOpen) {
        closeHistory();
        return;
      }
    }

    const art = getArtPlayer();
    if (el.viewTheater.style.display !== 'none' && art) {
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          if (art.video && art.video.paused) art.play();
          else art.pause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          art.currentTime = Math.max(0, art.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          art.currentTime = Math.min(art.duration || 9999, art.currentTime + 5);
          break;
        case '[':
          el.btnEpPrev.click();
          break;
        case ']':
          el.btnEpNext.click();
          break;
        case 'f':
        case 'F':
          art.fullscreen = !art.fullscreen;
          break;
      }
    }
  });
}

// === Application Boot ===
async function boot() {
  loadSearchHistory();
  setupEventListeners();
  await initSystem();

  // Preload watch history cache
  try {
    const hData = await apiGet('/api/history');
    state.history = hData || [];
  } catch (e) {}

  // Load first catalog page
  loadCatalogPage(1, true);
}

boot();
