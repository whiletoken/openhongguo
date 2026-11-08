// OpenHongguo Web - Video Player & Theater Mode Module

import { state, el } from './state.js';
import { apiGet, apiPost, buildApiUrl } from './api.js';
import { formatHeat, showToast, escapeHtml } from './utils.js';
import { saveCurrentHistory } from './history.js';
import { updateTheaterFavButton } from './favorites.js';

let art = null;

export function getArtPlayer() {
  return art;
}

export function getOrInitArtPlayer(streamUrl, title) {
  if (art) return art;

  art = new window.Artplayer({
    container: el.artplayerContainer,
    url: streamUrl,
    title: title,
    poster: '',
    volume: 0.8,
    isLive: false,
    muted: false,
    autoplay: true,
    pip: true,
    autoSize: false,
    autoMini: false,
    screenshot: true,
    setting: true,
    loop: false,
    flip: true,
    playbackRate: true,
    aspectRatio: true,
    fullscreen: true,
    fullscreenWeb: true,
    miniProgressBar: true,
    mutex: true,
    backdrop: true,
    playsInline: true,
    autoPlayback: true,
    airplay: false,
    theme: '#ff4d4f',
    lang: 'zh-cn',
    hotkey: false,
    controls: [
      {
        name: 'prev-ep',
        index: 10,
        position: 'left',
        html: '<button class="art-icon" style="padding:0;background:none;border:none;cursor:pointer;color:#fff;display:flex;align-items:center;" title="上一集"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="19,20 9,12 19,4"></polygon><line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="2.5"></line></svg></button>',
        tooltip: '上一集',
        click: function () {
          if (state.currentEpIndex > 0) {
            loadEpisode(state.currentEpIndex - 1, true);
          } else {
            art.notice.show = '已经是第一集了';
          }
        },
      },
      {
        name: 'next-ep',
        index: 11,
        position: 'left',
        html: '<button class="art-icon" style="padding:0;background:none;border:none;cursor:pointer;color:#fff;display:flex;align-items:center;" title="下一集"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="5,4 15,12 5,20"></polygon><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2.5"></line></svg></button>',
        tooltip: '下一集',
        click: function () {
          if (state.currentEpIndex < state.episodes.length - 1) {
            loadEpisode(state.currentEpIndex + 1, true);
          } else {
            art.notice.show = '全剧已播放完毕';
          }
        },
      },
    ],
    quality: [
      { default: state.currentQuality === '1080p', html: '1080P 超清', url: '1080p' },
      { default: state.currentQuality === '720p', html: '720P 高清', url: '720p' },
      { default: state.currentQuality === '480p', html: '480P 标清', url: '480p' },
    ],
  });

  // Auto Play Next on Ended
  art.on('video:ended', () => {
    saveCurrentHistory(art, true);
    if (state.autoplay) {
      if (state.currentEpIndex < state.episodes.length - 1) {
        const nextEp = state.episodes[state.currentEpIndex + 1];
        art.notice.show = `即将播放第 ${nextEp ? nextEp.number : state.currentEpIndex + 2} 集`;
        loadEpisode(state.currentEpIndex + 1, true);
      } else {
        art.notice.show = '全剧已播放完毕！';
        showToast('全剧已播放完毕！', 'success');
      }
    }
  });

  // Throttled history save (every ~6 seconds)
  let lastSave = 0;
  art.on('video:timeupdate', () => {
    const now = Date.now();
    if (now - lastSave > 6000) {
      lastSave = now;
      saveCurrentHistory(art, false);
    }
  });

  // Quality switch
  art.on('quality', (item) => {
    if (item.url && item.url !== state.currentQuality) {
      state.currentQuality = item.url;
      el.selectQuality.value = item.url;
      const curTime = art.currentTime || 0;
      art.notice.show = `切换清晰度至 ${item.html}`;
      loadEpisode(state.currentEpIndex, true, curTime);
    }
  });

  // Auto detect aspect ratio when metadata is loaded
  art.on('video:loadedmetadata', () => {
    if (state.aspectRatio === 'auto') {
      applyAspectRatio('auto');
    }
  });

  // Error event
  art.on('video:error', () => {
    if (state.loadingTimer) {
      clearTimeout(state.loadingTimer);
      state.loadingTimer = null;
    }
    el.videoLoading.style.display = 'flex';
    el.videoLoadingMsg.textContent = '视频流加载异常，如为 DRM 加密剧请确保系统已安装 FFmpeg';
    showToast('视频加载出错，可在右侧尝试切换画质或使用外部播放器', 'error');
  });

  return art;
}

export async function openSeries(seriesId, targetEpNum = 1) {
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
    updateTheaterFavButton();
    state.episodes = epPage.items || [];

    // Update meta in UI
    el.theaterSeriesCover.src = series.cover_url || '';
    el.theaterSeriesTitle.textContent = series.title || '短剧';
    el.theaterEpCount.textContent = series.episode_count ? `全${series.episode_count}集` : `共${state.episodes.length}集`;
    el.theaterHeat.textContent = series.heat ? `热度 ${formatHeat(series.heat)}` : '';
    el.theaterSeriesSummary.textContent = series.summary || '暂无剧情简介。';

    // Tags
    el.theaterSeriesTags.innerHTML = (series.tags || [])
      .map((t) => `<span class="stat-badge">${escapeHtml(t)}</span>`)
      .join('');

    el.epTotalLabel.textContent = `共 ${state.episodes.length} 集`;

    // Check history to resume
    let resumeSeconds = 0;
    let startEpIndex = 0;

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

export async function loadEpisode(index, autoPlay = true, resumeSeconds = 0) {
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

  const streamUrl = buildApiUrl(`/api/stream?episode_id=${encodeURIComponent(ep.id)}&series_id=${encodeURIComponent(series ? series.id : '')}&quality=${encodeURIComponent(state.currentQuality)}`);
  const title = `第 ${ep.number} 集 - ${series ? series.title : ''}`;
  const isNew = !art;
  const player = getOrInitArtPlayer(streamUrl, title);

  // Trigger sliding window active cache (caches upcoming 10 episodes, keeps <= 12)
  notifyActiveCache(ep);

  const applyPlayback = () => {
    if (state.loadingTimer) {
      clearTimeout(state.loadingTimer);
      state.loadingTimer = null;
    }
    el.videoLoading.style.display = 'none';

    if (resumeSeconds > 0 && resumeSeconds < player.duration - 5) {
      player.currentTime = resumeSeconds;
      player.notice.show = `已恢复至 ${Math.floor(resumeSeconds / 60)}分${Math.floor(resumeSeconds % 60)}秒 继续播放`;
    }

    if (autoPlay) {
      player.play().catch((err) => {
        console.warn('Autoplay restricted by browser, click play:', err);
      });
    }
  };

  if (isNew) {
    player.on('ready', applyPlayback);
  } else {
    player.switchUrl(streamUrl, title).then(applyPlayback).catch((err) => {
      console.warn('switchUrl error:', err);
    });
  }

  // Update button states
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

  saveCurrentHistory(player, false);
}

export function renderEpisodeRangeTabs() {
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

export function renderEpisodeButtons(startIndex, endIndex) {
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
    btn.onclick = () => {
      btn.blur();
      loadEpisode(realIndex, true);
    };
    el.episodesGrid.appendChild(btn);
  });
}

export function updateActiveEpisodeButton() {
  el.episodesGrid.querySelectorAll('.ep-btn').forEach((btn) => {
    const epNum = parseInt(btn.textContent, 10);
    btn.classList.toggle('active', epNum === (state.currentEpIndex + 1));
    const ep = state.episodes.find((e) => e.number === epNum);
    if (ep && state.cachedEpIDs && state.cachedEpIDs.has(ep.id)) {
      btn.classList.add('cached');
    }
  });
}

export async function notifyActiveCache(ep) {
  if (!state.currentSeries) return;
  try {
    const payload = {
      series_id: state.currentSeries.id,
      episode_id: ep.id,
      quality: state.currentQuality,
      episodes: state.episodes.map((e) => ({ id: e.id, number: e.number, title: e.title })),
    };
    const res = await apiPost('/api/cache/active', payload);
    updateCacheWindowUI(res);
    // Reset to active polling rate (2.5s) while prefetching
    if (state.cacheWindowTimer) {
      clearInterval(state.cacheWindowTimer);
      state.cachePollInterval = 2500;
      state.cacheWindowTimer = setInterval(pollCacheWindow, 2500);
    }
    if (res.last_event === 'jump_cleared_refilling') {
      showToast(`已跳级至第 ${ep.number} 集，已清空并重置后10集预载窗口`, 'info', 2200);
    }
  } catch (e) {
    console.warn('Cache window activate failed:', e);
  }
}

export function updateCacheWindowUI(res) {
  if (!res) return;
  state.cachedEpIDs = new Set(res.cached_ep_ids || []);
  if (el.cacheStatusText) {
    const prefetchStr = res.is_prefetching ? ' (⚡正在缓存后10集...)' : ' (已就绪)';
    el.cacheStatusText.textContent = `智能缓存: 已缓存 ${res.total_cached || 0}/${res.max_cached || 12} 集${prefetchStr}`;
  }
  // Update episode buttons cached indicator
  el.episodesGrid.querySelectorAll('.ep-btn').forEach((btn) => {
    const epNum = parseInt(btn.textContent, 10);
    const ep = state.episodes.find((e) => e.number === epNum);
    if (ep && state.cachedEpIDs.has(ep.id)) {
      btn.classList.add('cached');
      btn.title = `第 ${ep.number} 集 (已本地缓存 秒播)`;
    } else {
      btn.classList.remove('cached');
    }
  });
}

export async function pollCacheWindow() {
  if (!state.currentSeries || el.viewTheater.style.display === 'none') return;
  try {
    const res = await apiGet(`/api/cache/window?series_id=${encodeURIComponent(state.currentSeries.id)}&quality=${encodeURIComponent(state.currentQuality)}`);
    updateCacheWindowUI(res);
    // Adaptive polling: poll at 2.5s while prefetching; back off to 8s once idle
    if (state.cacheWindowTimer) {
      const targetInterval = res && res.is_prefetching ? 2500 : 8000;
      if (state.cachePollInterval !== targetInterval) {
        state.cachePollInterval = targetInterval;
        clearInterval(state.cacheWindowTimer);
        state.cacheWindowTimer = setInterval(pollCacheWindow, targetInterval);
      }
    }
  } catch (e) {}
}

export function switchToTheater() {
  el.viewCatalog.style.display = 'none';
  el.viewTheater.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (!state.cacheWindowTimer) {
    pollCacheWindow();
    state.cacheWindowTimer = setInterval(pollCacheWindow, 2500);
  }
}

export function switchToCatalog() {
  if (state.loadingTimer) {
    clearTimeout(state.loadingTimer);
    state.loadingTimer = null;
  }
  el.videoLoading.style.display = 'none';
  if (art) art.pause();
  el.viewTheater.style.display = 'none';
  el.viewCatalog.style.display = 'block';
  if (state.cacheWindowTimer) {
    clearInterval(state.cacheWindowTimer);
    state.cacheWindowTimer = null;
  }
}


export function applyAspectRatio(mode = 'auto') {
  state.aspectRatio = mode;
  try { localStorage.setItem('ohg_aspect_ratio', mode); } catch (e) {}
  if (el.selectAspectRatio && el.selectAspectRatio.value !== mode) {
    el.selectAspectRatio.value = mode;
  }

  if (!el.videoContainer) return;

  el.videoContainer.classList.remove(
    'aspect-portrait',
    'aspect-16-9',
    'aspect-4-3',
    'aspect-fill',
    'aspect-original'
  );

  let noticeText = '';

  if (mode === 'auto') {
    const video = art && art.video;
    if (video && video.videoWidth && video.videoHeight) {
      if (video.videoHeight > video.videoWidth) {
        el.videoContainer.classList.add('aspect-portrait');
        noticeText = '画面已自适应为 9:16 竖屏模式';
      } else {
        el.videoContainer.classList.add('aspect-16-9');
        noticeText = '画面已自适应为 16:9 宽屏模式';
      }
    } else {
      el.videoContainer.classList.add('aspect-16-9');
    }
  } else if (mode === '16:9') {
    el.videoContainer.classList.add('aspect-16-9');
    noticeText = '已切换为 16:9 宽屏模式';
  } else if (mode === '9:16') {
    el.videoContainer.classList.add('aspect-portrait');
    noticeText = '已切换为 9:16 竖屏短剧模式';
  } else if (mode === '4:3') {
    el.videoContainer.classList.add('aspect-4-3');
    noticeText = '已切换为 4:3 经典模式';
  } else if (mode === 'fill') {
    el.videoContainer.classList.add('aspect-fill');
    noticeText = '已切换为铺满拉伸模式';
  } else if (mode === 'original') {
    el.videoContainer.classList.add('aspect-original');
    noticeText = '已切换为原始比例模式';
  }

  if (art) {
    setTimeout(() => {
      try {
        art.resize();
        if (noticeText && art.notice) {
          art.notice.show = noticeText;
        }
      } catch (e) {}
    }, 60);
  }
}

export function toggleTheaterWide(force) {
  state.theaterWide = typeof force === 'boolean' ? force : !state.theaterWide;
  try { localStorage.setItem('ohg_theater_wide', state.theaterWide ? 'true' : 'false'); } catch (e) {}

  if (el.theaterContainer) {
    el.theaterContainer.classList.toggle('theater-wide', state.theaterWide);
  }

  if (el.btnTheaterMode) {
    el.btnTheaterMode.classList.toggle('active', state.theaterWide);
    const textEl = el.btnTheaterMode.querySelector('.theater-mode-text');
    if (textEl) {
      textEl.textContent = state.theaterWide ? '标准分栏' : '大屏模式';
    }
  }

  showToast(state.theaterWide ? '已开启剧场大屏模式' : '已恢复标准分栏视图', 'info');

  if (art) {
    setTimeout(() => {
      try {
        art.resize();
      } catch (e) {}
    }, 120);
  }
}

export function initPlayerPreferences() {
  const savedAspect = localStorage.getItem('ohg_aspect_ratio') || 'auto';
  state.aspectRatio = savedAspect;
  if (el.selectAspectRatio) {
    el.selectAspectRatio.value = savedAspect;
  }
  applyAspectRatio(savedAspect);

  const savedWide = localStorage.getItem('ohg_theater_wide') === 'true';
  state.theaterWide = savedWide;
  if (el.theaterContainer) {
    el.theaterContainer.classList.toggle('theater-wide', savedWide);
  }
  if (el.btnTheaterMode) {
    el.btnTheaterMode.classList.toggle('active', savedWide);
    const textEl = el.btnTheaterMode.querySelector('.theater-mode-text');
    if (textEl) {
      textEl.textContent = savedWide ? '标准分栏' : '大屏模式';
    }
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (art && el.viewTheater && el.viewTheater.style.display !== 'none') {
        try {
          art.resize();
          if (state.aspectRatio === 'auto') {
            applyAspectRatio('auto');
          }
        } catch (e) {}
      }
    }, 150);
  });
}
