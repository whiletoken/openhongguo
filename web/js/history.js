// OpenHongguo Web - Watch History Module

import { state, el } from './state.js';
import { apiGet, apiPost, apiDelete } from './api.js';
import { formatTimeAgo, escapeHtml, showToast } from './utils.js';

let openSeriesHandler = null;

export function setOpenSeriesHandler(fn) {
  openSeriesHandler = fn;
}

export async function saveCurrentHistory(artPlayer, finished = false) {
  if (!state.currentSeries || !state.episodes[state.currentEpIndex]) return;
  const series = state.currentSeries;
  const ep = state.episodes[state.currentEpIndex];

  let pos = 0;
  if (artPlayer && typeof artPlayer.currentTime === 'number') {
    pos = artPlayer.currentTime;
  } else if (artPlayer && artPlayer.video && typeof artPlayer.video.currentTime === 'number') {
    pos = artPlayer.video.currentTime;
  }

  const entry = {
    series_id: series.id,
    title: series.title,
    episode: ep.number,
    episodes: state.episodes.length,
    finished: finished,
    position: pos,
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

export async function openHistory() {
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

export function closeHistory() {
  state.historyOpen = false;
  el.historyDrawer.classList.remove('open');
  el.drawerOverlay.classList.remove('open');
}

export function renderHistoryList() {
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
      if (openSeriesHandler) {
        openSeriesHandler(h.series_id, h.episode);
      }
    };

    const progress = h.finished ? '已看完本集' : `看到第 ${h.episode} 集 (已看 ${Math.floor((h.position || 0) / 60)}分)`;
    item.innerHTML = `
      <div class="history-item-info">
        <div class="history-title" title="${escapeHtml(h.title || '')}">${escapeHtml(h.title || '未知剧名')}</div>
        <div class="history-ep">${progress}</div>
        <div class="history-time">${formatTimeAgo(h.updated_at)}</div>
      </div>
    `;
    el.historyList.appendChild(item);
  });
}

export async function clearHistory() {
  if (!confirm('确定清空所有观看历史记录吗？')) return;
  try {
    await apiDelete('/api/history');
    state.history = [];
    renderHistoryList();
    showToast('历史记录已清空', 'info');
  } catch (e) {
    showToast('清空失败: ' + e.message, 'error');
  }
}
