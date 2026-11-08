// OpenHongguo Web - Episodes Grid & Pagination Subsystem

import { state, el } from './state.js';

export const EP_CHUNK_SIZE = 30;

let onEpisodeSelect = null;

export function setEpisodeSelectHandler(fn) {
  onEpisodeSelect = fn;
}

/**
 * Renders the 30-episode chunk pagination tabs & stepper controls
 */
export function renderEpisodePagination() {
  const total = state.episodes.length;
  if (!el.episodesPaginationModule) return;

  if (total <= EP_CHUNK_SIZE) {
    el.episodesPaginationModule.style.display = 'none';
    return;
  }

  el.episodesPaginationModule.style.display = 'flex';
  const numChunks = Math.ceil(total / EP_CHUNK_SIZE);
  const curChunk = state.currentChunkIndex || 0;

  // Stepper navigation buttons state
  if (el.btnEpChunkPrev) {
    el.btnEpChunkPrev.disabled = curChunk <= 0;
  }
  if (el.btnEpChunkNext) {
    el.btnEpChunkNext.disabled = curChunk >= numChunks - 1;
  }
  if (el.epPageIndicator) {
    const start = curChunk * EP_CHUNK_SIZE + 1;
    const end = Math.min((curChunk + 1) * EP_CHUNK_SIZE, total);
    el.epPageIndicator.textContent = `第 ${curChunk + 1}/${numChunks} 组 (${start}-${end}集)`;
  }

  // Range tabs rendering
  el.epRangeTabs.innerHTML = '';
  for (let i = 0; i < numChunks; i++) {
    const start = i * EP_CHUNK_SIZE + 1;
    const end = Math.min((i + 1) * EP_CHUNK_SIZE, total);
    const tab = document.createElement('button');
    tab.className = `ep-range-tab ${i === curChunk ? 'active' : ''}`;
    tab.textContent = `${start} - ${end} 集`;
    tab.onclick = () => {
      switchEpisodeChunk(i);
    };
    el.epRangeTabs.appendChild(tab);
  }
}

/**
 * Switches the current visible episode chunk
 */
export function switchEpisodeChunk(chunkIdx) {
  const numChunks = Math.ceil(state.episodes.length / EP_CHUNK_SIZE);
  if (chunkIdx < 0 || chunkIdx >= numChunks) return;
  state.currentChunkIndex = chunkIdx;
  renderEpisodePagination();
  renderEpisodeButtonsForCurrentPage();
  updateActiveEpisodeButton();
}

/**
 * Renders episode buttons for the current chunk
 */
export function renderEpisodeButtonsForCurrentPage() {
  el.episodesGrid.innerHTML = '';
  const total = state.episodes.length;
  const curChunk = state.currentChunkIndex || 0;
  const start = curChunk * EP_CHUNK_SIZE;
  const end = Math.min(start + EP_CHUNK_SIZE, total);

  for (let realIndex = start; realIndex < end; realIndex++) {
    const ep = state.episodes[realIndex];
    if (!ep) continue;
    const btn = document.createElement('button');
    const isCached = state.cachedEpIDs && state.cachedEpIDs.has(ep.id);
    btn.className = `ep-btn ${realIndex === state.currentEpIndex ? 'active' : ''} ${isCached ? 'cached' : ''}`;
    btn.textContent = ep.number || (realIndex + 1);
    btn.dataset.index = realIndex;
    btn.dataset.epNum = ep.number || (realIndex + 1);
    const cachedTip = isCached ? ' (已本地缓存 秒播)' : '';
    btn.title = `第 ${ep.number} 集${ep.title ? ' - ' + ep.title : ''}${cachedTip}`;
    btn.onclick = () => {
      btn.blur();
      if (onEpisodeSelect) {
        onEpisodeSelect(realIndex, true);
      }
    };
    el.episodesGrid.appendChild(btn);
  }
}

/**
 * Highlights current playing episode and scrolls it into view
 */
export function updateActiveEpisodeButton() {
  let activeBtn = null;
  el.episodesGrid.querySelectorAll('.ep-btn').forEach((btn) => {
    const idx = parseInt(btn.dataset.index, 10);
    const isActive = idx === state.currentEpIndex;
    btn.classList.toggle('active', isActive);
    if (isActive) activeBtn = btn;
    const ep = state.episodes[idx];
    if (ep && state.cachedEpIDs && state.cachedEpIDs.has(ep.id)) {
      btn.classList.add('cached');
    }
  });

  if (activeBtn) {
    activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Update active range tab highlight
  if (state.episodes.length > EP_CHUNK_SIZE) {
    const curChunk = state.currentChunkIndex || 0;
    const tabs = el.epRangeTabs.querySelectorAll('.ep-range-tab');
    tabs.forEach((t, i) => t.classList.toggle('active', i === curChunk));
  }
}

/**
 * Binds episode pagination stepper controls
 */
export function bindEpisodePaginationEvents() {
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
}
