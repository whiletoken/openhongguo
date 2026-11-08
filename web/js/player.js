// OpenHongguo Web - Video Player Engine

import { state, el } from './state.js';
import { apiGet, apiPost, buildApiUrl } from './api.js';
import { formatHeat, showToast, escapeHtml } from './utils.js';
import { saveCurrentHistory } from './history.js';
import { updateTheaterFavButton } from './favorites.js';
import {
  EP_CHUNK_SIZE,
  renderEpisodePagination,
  renderEpisodeButtonsForCurrentPage,
  updateActiveEpisodeButton,
  setEpisodeSelectHandler,
} from './episodes.js';
import { notifyActiveCache } from './cache_sync.js';
import { switchToTheater, applyAspectRatio, setArtPlayerGetter } from './theater_layout.js';

let art = null;

export function getArtPlayer() {
  return art;
}

// Connect layout engine with player getter
setArtPlayerGetter(getArtPlayer);

// Connect episodes module with loadEpisode
setEpisodeSelectHandler((idx, autoPlay) => {
  loadEpisode(idx, autoPlay);
});

/**
 * Creates or retrieves the singleton Artplayer instance
 */
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
        html: '<button class="art-icon" style="padding:0;background:none;border:none;cursor:pointer;color:#fff;display:flex;align-items:center;" title="下一集"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="5,4 15,12 5,20"></polygon><line x1="19" y1="19" x2="19" y2="20" stroke="currentColor" stroke-width="2.5"></line></svg></button>',
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

/**
 * Fetches series information and starts playback of target episode
 */
export async function openSeries(seriesId, targetEpNum = 1) {
  switchToTheater();
  el.videoLoading.style.display = 'flex';
  el.videoLoadingMsg.textContent = '正在获取短剧信息与选集...';

  try {
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

    state.currentChunkIndex = Math.floor(startEpIndex / EP_CHUNK_SIZE);
    renderEpisodePagination();
    renderEpisodeButtonsForCurrentPage();
    loadEpisode(startEpIndex, true, resumeSeconds);
  } catch (err) {
    showToast('加载短剧详情失败: ' + err.message, 'error');
    el.videoLoadingMsg.textContent = '加载失败: ' + err.message;
  }
}

/**
 * Loads and plays a specific episode by its index
 */
export async function loadEpisode(index, autoPlay = true, resumeSeconds = 0) {
  if (index < 0 || index >= state.episodes.length) return;

  state.currentEpIndex = index;
  const ep = state.episodes[index];
  const series = state.currentSeries;

  el.playerTitle.textContent = `第 ${ep.number} 集 - ${series ? series.title : ''}`;

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

  // Trigger sliding window active cache
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

  // Auto switch page chunk if needed
  const neededChunk = Math.floor(index / EP_CHUNK_SIZE);
  if (neededChunk !== (state.currentChunkIndex || 0)) {
    state.currentChunkIndex = neededChunk;
    renderEpisodePagination();
    renderEpisodeButtonsForCurrentPage();
  }
  updateActiveEpisodeButton();

  saveCurrentHistory(player, false);
}

/**
 * Binds video player controls & secondary action buttons
 */
export function bindPlayerControls() {
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
    const curArt = getArtPlayer();
    const curTime = (curArt && curArt.currentTime) ? curArt.currentTime : 0;
    showToast(`切换清晰度至 ${state.currentQuality}`, 'info');
    loadEpisode(state.currentEpIndex, true, curTime);
  };

  // Shortcuts tip button
  if (el.btnShortcutsTip) {
    el.btnShortcutsTip.onclick = () => {
      showToast('快捷键: 空格/K 播放/暂停 | 左右方向键 快退/快进5秒 | 上下键 调音量 | [ ] 上下集 | F 全屏', 'info', 4000);
    };
  }

  // Download episode
  el.btnDownloadEp.onclick = () => {
    const ep = state.episodes[state.currentEpIndex];
    const series = state.currentSeries;
    if (!ep) return;
    const fileName = `${series ? series.title : '短剧'}_第${ep.number}集.mp4`;
    const url = buildApiUrl(`/api/download?episode_id=${encodeURIComponent(ep.id)}&quality=${encodeURIComponent(state.currentQuality)}&filename=${encodeURIComponent(fileName)}`);
    showToast('正在开始下载本集...', 'success');
    window.open(url, '_blank');
  };

  // External player
  el.btnPlayExternal.onclick = async () => {
    const ep = state.episodes[state.currentEpIndex];
    if (!ep) return;
    const curArt = getArtPlayer();
    const startSec = Math.floor((curArt && curArt.currentTime) ? curArt.currentTime : 0);
    try {
      if (curArt) curArt.pause();
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
}
