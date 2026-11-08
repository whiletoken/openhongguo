// OpenHongguo Web - Smart Sliding Window Cache Sync & Prefetch Module

import { state, el } from './state.js';
import { apiGet, apiPost } from './api.js';
import { showToast } from './utils.js';

/**
 * Notifies the backend of active playback position to trigger sliding window cache
 */
export async function notifyActiveCache(ep) {
  if (!state.currentSeries || !ep) return;
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

/**
 * Synchronizes cache indicator text and episode badges
 */
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

/**
 * Polls cache window state with adaptive frequency
 */
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

/**
 * Starts cache polling when entering theater mode
 */
export function startCachePolling() {
  if (state.cacheWindowTimer) return;
  pollCacheWindow();
  state.cachePollInterval = 2500;
  state.cacheWindowTimer = setInterval(pollCacheWindow, 2500);
}

/**
 * Stops cache polling when exiting theater mode
 */
export function stopCachePolling() {
  if (state.cacheWindowTimer) {
    clearInterval(state.cacheWindowTimer);
    state.cacheWindowTimer = null;
  }
}
