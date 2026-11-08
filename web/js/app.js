// OpenHongguo Web - Application Entrypoint & Event Coordinator

import { state, el } from './state.js';
import { apiGet, apiPost, buildApiUrl, getServerUrl } from './api.js';
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
  applyAspectRatio,
  toggleTheaterWide,
  toggleEpisodesHidden,
  switchEpisodeChunk,
  initPlayerPreferences,
} from './player.js';
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
  openSettingsModal,
  closeSettingsModal,
  setReloadAppHandler,
} from './settings.js';

// === Connect Subsystems ===
setCatalogOpenSeriesHandler(openSeries);
setHistoryOpenSeriesHandler(openSeries);
setFavoritesOpenSeriesHandler(openSeries);

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
setReloadAppHandler(reloadApp);

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

    // Auto-close sidebar on mobile
    if (window.innerWidth <= 768) {
      document.getElementById('app')?.classList.remove('sidebar-mobile-open');
    }

    state.channel = tab.dataset.channel;
    state.searchQuery = '';
    el.searchInput.value = '';
    el.searchClear.style.display = 'none';
    el.catalogFilters.style.display = 'none';
    const tabLabel = tab.querySelector('span')?.textContent?.trim() || tab.dataset.channel;
    el.channelTitle.textContent = `${tabLabel}短剧`;
    if (state.channel === '收藏') {
      el.channelTitle.textContent = '⭐ 我的收藏';
      el.channelSubtitle.textContent = `共收藏了 ${(state.favorites || []).length} 部精彩短剧`;
    } else {
        el.channelSubtitle.textContent = `实时更新「${tabLabel}」分类`;
    }

    switchToCatalog();
    loadCatalog(true);
  });

  // Brand / Home button
  el.btnHome.onclick = () => {
    state.searchQuery = '';
    el.searchInput.value = '';
    el.searchClear.style.display = 'none';
    el.catalogFilters.style.display = 'none';
    if (window.innerWidth <= 768) {
      document.getElementById('app')?.classList.remove('sidebar-mobile-open');
    }
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

  // Aspect Ratio / Adaptive Sizing
  if (el.selectAspectRatio) {
    el.selectAspectRatio.onchange = () => {
      applyAspectRatio(el.selectAspectRatio.value);
    };
  }

  // Theater Wide Mode Toggle
  if (el.btnTheaterMode) {
    el.btnTheaterMode.onclick = () => {
      toggleTheaterWide();
    };
  }

  // Episode Panel Hide / Show Toggles (向右隐藏 / 展开)
  if (el.btnHideEpisodes) {
    el.btnHideEpisodes.onclick = () => {
      toggleEpisodesHidden(true);
    };
  }
  if (el.btnToggleEpisodesTop) {
    el.btnToggleEpisodesTop.onclick = () => {
      toggleEpisodesHidden();
    };
  }
  if (el.btnToggleEpisodesBar) {
    el.btnToggleEpisodesBar.onclick = () => {
      toggleEpisodesHidden();
    };
  }

  // Episode Pagination Steppers (上一组 / 下一组)
  if (el.btnEpChunkPrev) {
    el.btnEpChunkPrev.onclick = () => {
      switchEpisodeChunk((state.currentChunkIndex || 0) - 1);
    };
  }
  if (el.btnEpChunkNext) {
    el.btnEpChunkNext.onclick = () => {
      switchEpisodeChunk((state.currentChunkIndex || 0) + 1);
    };
  }

  // Keyboard Shortcuts Tip
  if (el.btnShortcutsTip) {
    el.btnShortcutsTip.onclick = () => {
      showToast('快捷键: 空格/K 播放/暂停 | 左右方向键 快退/快进5秒 | 上下键 调音量 | [ ] 上下集 | F 全屏', 'info', 4000);
    };
  }

  // Sidebar Collapse / Mobile Toggle
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const app = document.getElementById('app');

  if (el.btnSidebarCollapse && app) {
    el.btnSidebarCollapse.onclick = () => {
      if (window.innerWidth <= 768) {
        app.classList.remove('sidebar-mobile-open');
      } else {
        app.classList.add('sidebar-collapsed');
      }
    };
  }

  if (el.btnSidebarToggle && app) {
    el.btnSidebarToggle.onclick = () => {
      if (window.innerWidth <= 768) {
        app.classList.toggle('sidebar-mobile-open');
      } else {
        app.classList.toggle('sidebar-collapsed');
      }
    };
  }

  if (sidebarBackdrop && app) {
    sidebarBackdrop.onclick = () => {
      app.classList.remove('sidebar-mobile-open');
    };
  }

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
    const url = buildApiUrl(`/api/download?episode_id=${encodeURIComponent(ep.id)}&quality=${encodeURIComponent(state.currentQuality)}&filename=${encodeURIComponent(fileName)}`);
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
  el.drawerOverlay.onclick = () => {
    closeSettingsModal();
    closeHistory();
    closeFavorites();
  };
  el.btnClearHistory.onclick = clearHistory;

  // Favorites Drawer & Actions
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
  // Server Settings & URL sync
  initSettingsEvents();
  window.addEventListener('server-url-changed', () => {
    reloadApp();
  });

  window.addEventListener('favorites-updated', () => {
    if (state.channel === '收藏') {
      loadCatalogPage(1, true);
    }
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    const isEditing = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || (e.target && e.target.isContentEditable);

    if (isEditing) {
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
      if (state.settingsOpen) {
        closeSettingsModal();
        return;
      }
      if (state.favoritesOpen) {
        closeFavorites();
        return;
      }
      if (state.historyOpen) {
        closeHistory();
        return;
      }
    }

    const art = getArtPlayer();
    if (el.viewTheater && el.viewTheater.style.display !== 'none' && art) {
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.keyCode === 32;

      if (isSpace || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        e.stopPropagation();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        if (typeof art.toggle === 'function') {
          art.toggle();
        } else if (art.video) {
          if (art.video.paused) {
            art.play();
          } else {
            art.pause();
          }
        }
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          art.currentTime = Math.max(0, art.currentTime - 5);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          art.currentTime = Math.min(art.duration || 9999, art.currentTime + 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          art.volume = Math.min(1, Number((art.volume + 0.1).toFixed(2)));
          break;
        case 'ArrowDown':
          e.preventDefault();
          art.volume = Math.max(0, Number((art.volume - 0.1).toFixed(2)));
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          art.muted = !art.muted;
          break;
        case '[':
          e.preventDefault();
          el.btnEpPrev.click();
          break;
        case ']':
          e.preventDefault();
          el.btnEpNext.click();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          art.fullscreen = !art.fullscreen;
          break;
      }
    }
  });
}

// === Application Boot ===
async function boot() {
  // Forward window.scrollTo to .app-main container
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
  setupEventListeners();
  initPlayerPreferences();
  await initSystem();

  // Preload favorites and watch history cache
  try {
    await fetchFavorites();
  } catch (e) {}
  // Preload watch history cache
  try {
    const hData = await apiGet('/api/history');
    state.history = hData || [];
  } catch (e) {}

  // Load first catalog page
  loadCatalogPage(1, true);
}

boot();
