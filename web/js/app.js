// OpenHongguo Web - Application Entrypoint & Orchestrator

import { state, el } from './state.js';
import { apiGet, getServerUrl } from './api.js';
import {
  loadSearchHistory,
  addSearchHistory,
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
  getArtPlayer,
  bindPlayerControls,
} from './player.js';
import { bindEpisodePaginationEvents } from './episodes.js';
import {
  switchToCatalog,
  initPlayerPreferences,
  bindTheaterLayoutEvents,
} from './theater_layout.js';
import {
  initNavigation,
  setNavigationCallbacks,
} from './navigation.js';
import {
  initKeyboardShortcuts,
  setShortcutsDeps,
} from './shortcuts.js';
import {
  openHistory,
  closeHistory,
  clearHistory,
  setOpenSeriesHandler as setHistoryOpenSeriesHandler,
} from './history.js';
import {
  openFavorites,
  closeFavorites,
  clearFavorites,
  fetchFavorites,
  toggleFavorite,
  renderFavoritesList,
  setOpenSeriesHandler as setFavoritesOpenSeriesHandler,
} from './favorites.js';
import {
  initSettingsEvents,
  closeSettingsModal,
  setReloadAppHandler,
} from './settings.js';

// === Connect Cross-Module Handlers ===
setCatalogOpenSeriesHandler(openSeries);
setHistoryOpenSeriesHandler(openSeries);
setFavoritesOpenSeriesHandler(openSeries);

setShortcutsDeps({
  getArtPlayer,
  onEpisodeNav: (step) => {
    loadEpisode(state.currentEpIndex + step, true);
  },
});

setReloadAppHandler(reloadApp);

// === Application Reload & Coordinator ===
async function reloadApp() {
  await initSystem();
  try {
    await fetchFavorites();
  } catch (e) {}
  try {
    const hData = await apiGet('/api/history');
    state.history = hData || [];
  } catch (e) {}
  loadCatalogPage(1, true);
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

// === System Status & Server Connectivity ===
async function initSystem() {
  const dot = el.systemStatus.querySelector('.status-dot');
  const text = el.systemStatus.querySelector('.status-text');
  const srvHost = getServerUrl().replace(/^https?:\/\//, '');

  try {
    const data = await apiGet('/api/system/status');
    state.tools = data.tools || {};
    state.serverConnected = true;

    if (el.serverOfflineBanner) el.serverOfflineBanner.style.display = 'none';

    if (state.tools.ffmpeg_ready) {
      dot.className = 'status-dot online';
      text.textContent = `已连接 (${srvHost})`;
      el.systemStatus.title = `已连接服务端: ${getServerUrl()}\nFFmpeg: ${state.tools.ffmpeg_path || '已就绪'}\n桌面模式: ${state.tools.desktop_mode ? '支持' : '不支持'}\n点击修改服务端配置`;
    } else {
      dot.className = 'status-dot warning';
      text.textContent = `就绪·无FFmpeg (${srvHost})`;
      el.systemStatus.title = `服务端 ${getServerUrl()} 未检测到 FFmpeg，受保护视频可能需使用外部播放器\n点击修改服务端配置`;
    }
  } catch (e) {
    console.warn('System status fetch failed:', e);
    state.serverConnected = false;
    dot.className = 'status-dot offline';
    text.textContent = '未连接服务端 (点击设置)';
    el.systemStatus.title = `无法连接服务端: ${getServerUrl()}\n错误: ${e.message}\n点击打开设置配置服务端地址`;

    if (el.serverOfflineBanner) {
      el.serverOfflineBanner.style.display = 'flex';
      if (el.serverOfflineText) {
        el.serverOfflineText.textContent = `当前无法连接到服务端「${getServerUrl()}」，请确认服务端是否启动，或点击「修改地址」重新配置。`;
      }
    }
  }
}

// === Drawers & Common Controls Setup ===
function setupDrawersAndListeners() {
  // Navigation & Search callbacks
  setNavigationCallbacks({
    onSearch: triggerSearch,
    onChannel: () => loadCatalog(true),
  });
  initNavigation();

  // Pagination controls
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

  // History Drawer
  el.btnHistoryToggle.onclick = openHistory;
  el.btnCloseHistory.onclick = closeHistory;
  el.btnClearHistory.onclick = clearHistory;
  el.drawerOverlay.onclick = () => {
    closeSettingsModal();
    closeHistory();
    closeFavorites();
  };

  // Favorites Drawer
  if (el.btnFavoritesToggle) el.btnFavoritesToggle.onclick = openFavorites;
  if (el.btnCloseFavorites) el.btnCloseFavorites.onclick = closeFavorites;
  if (el.btnClearFavorites) el.btnClearFavorites.onclick = clearFavorites;
  if (el.btnTheaterFav) {
    el.btnTheaterFav.onclick = () => {
      if (state.currentSeries) toggleFavorite(state.currentSeries);
    };
  }
  if (el.favoritesSearchInput) {
    el.favoritesSearchInput.oninput = () => {
      renderFavoritesList(el.favoritesSearchInput.value);
    };
  }

  // Settings & Window Events
  initSettingsEvents();
  window.addEventListener('server-url-changed', reloadApp);
  window.addEventListener('favorites-updated', () => {
    if (state.channel === '收藏') {
      loadCatalogPage(1, true);
    }
  });

  // Player controls, Theater layout, Episodes pagination, Keyboard shortcuts
  bindPlayerControls();
  bindTheaterLayoutEvents();
  bindEpisodePaginationEvents();
  initKeyboardShortcuts();
}

// === Application Boot ===
async function boot() {
  // Scroll polyfill for sidebar / desktop layout
  const origScrollTo = window.scrollTo.bind(window);
  window.scrollTo = function(options) {
    const main = document.querySelector('.app-main');
    if (main) {
      if (typeof options === 'object') {
        main.scrollTo(options);
      } else {
        main.scrollTo(...arguments);
      }
    }
    origScrollTo(...arguments);
  };

  loadSearchHistory();
  setupDrawersAndListeners();
  initPlayerPreferences();
  await initSystem();

  try {
    await fetchFavorites();
  } catch (e) {}

  try {
    const hData = await apiGet('/api/history');
    state.history = hData || [];
  } catch (e) {}

  loadCatalogPage(1, true);
}

boot();
