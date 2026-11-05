// OpenHongguo Web - Search History Module

import { state, el } from './state.js';
import { escapeHtml, showToast } from './utils.js';

const SEARCH_HISTORY_KEY = 'openhongguo_search_history';
const SEARCH_HISTORY_MAX = 5;

let onSearchCallback = null;

export function setSearchCallback(fn) {
  onSearchCallback = fn;
}

export function loadSearchHistory() {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    state.searchHistory = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(state.searchHistory)) state.searchHistory = [];
  } catch (e) {
    state.searchHistory = [];
  }
}

export function addSearchHistory(query) {
  query = query ? query.trim() : '';
  if (!query) return;
  loadSearchHistory();
  state.searchHistory = state.searchHistory.filter((item) => item !== query);
  state.searchHistory.unshift(query);
  state.searchHistory = state.searchHistory.slice(0, SEARCH_HISTORY_MAX);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(state.searchHistory));
  } catch (e) {}
  renderSearchHistory();
}

export function removeSearchHistoryItem(query) {
  loadSearchHistory();
  state.searchHistory = state.searchHistory.filter((item) => item !== query);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(state.searchHistory));
  } catch (e) {}
  renderSearchHistory();
  if (state.searchHistory.length === 0) {
    hideSearchHistory();
  }
}

export function clearSearchHistory() {
  state.searchHistory = [];
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch (e) {}
  renderSearchHistory();
  hideSearchHistory();
  showToast('搜索历史已清空', 'info');
}

export function renderSearchHistory() {
  loadSearchHistory();
  if (!el.searchHistoryTags) return;
  el.searchHistoryTags.innerHTML = '';
  if (state.searchHistory.length === 0) {
    hideSearchHistory();
    return;
  }
  state.searchHistory.forEach((query) => {
    const tag = document.createElement('span');
    tag.className = 'search-tag';
    tag.innerHTML = `
      <span class="tag-text">${escapeHtml(query)}</span>
      <span class="tag-del" title="删除">&times;</span>
    `;
    tag.querySelector('.tag-text').onclick = (e) => {
      e.stopPropagation();
      el.searchInput.value = query;
      el.searchClear.style.display = 'block';
      hideSearchHistory();
      if (onSearchCallback) onSearchCallback(query);
    };
    tag.querySelector('.tag-del').onclick = (e) => {
      e.stopPropagation();
      removeSearchHistoryItem(query);
    };
    el.searchHistoryTags.appendChild(tag);
  });
}

export function showSearchHistory() {
  loadSearchHistory();
  if (state.searchHistory.length > 0 && el.searchHistoryDropdown) {
    renderSearchHistory();
    el.searchHistoryDropdown.style.display = 'block';
  }
}

export function hideSearchHistory() {
  if (el.searchHistoryDropdown) {
    el.searchHistoryDropdown.style.display = 'none';
  }
}
