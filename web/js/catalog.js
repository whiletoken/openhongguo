// OpenHongguo Web - Catalog & Pagination Module

import { state, el } from './state.js';
import { apiGet } from './api.js';
import { escapeHtml, showToast, formatHeat } from './utils.js';
import { isFavorited, toggleFavorite } from './favorites.js';

let openSeriesHandler = null;

export function setOpenSeriesHandler(fn) {
  openSeriesHandler = fn;
}

export async function loadCatalogPage(targetPage = 1, reset = false) {
  if (state.isLoadingCatalog) return;

  if (reset) {
    state.currentPage = 1;
    targetPage = 1;
    state.pageStack = [];
    el.seriesGrid.innerHTML = '';
    el.gridEmpty.style.display = 'none';
    if (el.paginationContainer) el.paginationContainer.style.display = 'none';
  }

  // Favorites Channel Mode (local in-memory collection)
  if (state.channel === '收藏') {
    state.isLoadingCatalog = false;
    el.gridLoader.style.display = 'none';
    const favItems = (state.favorites || []).map((f) => ({
      id: f.series_id,
      title: f.title,
      cover_url: f.cover_url,
      episode_count: f.episode_count,
      heat: f.heat,
      tags: f.tags,
    }));
    state.pageStack = [{
      items: favItems,
      cursor: '',
      hasMore: false,
    }];
    state.currentPage = 1;
    if (favItems.length === 0) {
      el.gridEmpty.style.display = 'flex';
      el.seriesGrid.innerHTML = '';
      if (el.paginationContainer) el.paginationContainer.style.display = 'none';
    } else {
      el.gridEmpty.style.display = 'none';
      renderSeriesCards(favItems);
      updatePaginationUI();
    }
    return;
  }

  // Fast-path: if targetPage is already cached in memory stack, render instantly (0ms)
  if (state.pageStack[targetPage - 1]) {
    state.currentPage = targetPage;
    const pageData = state.pageStack[targetPage - 1];
    renderSeriesCards(pageData.items);
    updatePaginationUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Determine cursor for targetPage
  let cursor = '';
  if (targetPage > 1) {
    const prevData = state.pageStack[targetPage - 2];
    if (!prevData || !prevData.hasMore || !prevData.cursor || !prevData.cursor.trim()) {
      showToast('已经是最后一页了', 'info');
      updatePaginationUI();
      return; // No more pages
    }
    cursor = prevData.cursor.trim();
  }

  state.isLoadingCatalog = true;
  el.gridLoader.style.display = 'flex';
  if (el.btnPagePrev) el.btnPagePrev.disabled = true;
  if (el.btnPageNext) el.btnPageNext.disabled = true;

  try {
    let page;
    if (state.searchQuery) {
      const url = `/api/search?q=${encodeURIComponent(state.searchQuery)}&cursor=${encodeURIComponent(cursor)}&filter=${encodeURIComponent(state.searchFilter || '')}`;
      page = await apiGet(url);
    } else {
      const url = `/api/discover?channel=${encodeURIComponent(state.channel)}&cursor=${encodeURIComponent(cursor)}`;
      page = await apiGet(url);
    }

    const items = page.items || [];
    const nextCursor = (page.cursor || '').trim();

    // Check if this page has duplicate / repeated items indicating the feed has looped
    const seenIds = new Set();
    for (let i = 0; i < targetPage - 1; i++) {
      if (state.pageStack[i] && state.pageStack[i].items) {
        state.pageStack[i].items.forEach((it) => {
          if (it.id) seenIds.add(it.id);
        });
      }
    }

    // Determine how many items are fresh/new
    const hasNewItems = items.some((it) => it.id && !seenIds.has(it.id));

    // If targetPage > 1 and there are no items, or all items were already seen (circular feed end)
    if (targetPage > 1 && (items.length === 0 || !hasNewItems)) {
      if (state.pageStack[targetPage - 2]) {
        state.pageStack[targetPage - 2].hasMore = false;
        state.pageStack[targetPage - 2].cursor = '';
      }
      showToast('已经是最后一页了', 'info');
      updatePaginationUI();
      return;
    }

    // Strict evaluation of whether a next page exists:
    // 1. page.has_more must not be false
    // 2. nextCursor must be present and advanced
    // 3. items must not be empty
    const isCursorAdvanced = nextCursor !== '' && nextCursor !== cursor;
    const isServerHasMore = page.has_more !== false;
    const hasMore = Boolean(isServerHasMore && isCursorAdvanced && items.length > 0);

    state.pageStack[targetPage - 1] = {
      items: items,
      cursor: hasMore ? nextCursor : '',
      hasMore: hasMore,
    };

    state.currentPage = targetPage;

    if (items.length === 0 && targetPage === 1) {
      el.gridEmpty.style.display = 'flex';
      el.seriesGrid.innerHTML = '';
      if (el.paginationContainer) el.paginationContainer.style.display = 'none';
    } else {
      el.gridEmpty.style.display = 'none';
      renderSeriesCards(items);
      updatePaginationUI();
      if (targetPage > 1) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  } catch (err) {
    showToast('加载失败: ' + err.message, 'error');
    if (state.pageStack.length === 0) {
      el.gridEmpty.style.display = 'flex';
    }
  } finally {
    state.isLoadingCatalog = false;
    el.gridLoader.style.display = 'none';
    updatePaginationUI();
  }
}

export function loadCatalog(reset = false) {
  if (reset) {
    loadCatalogPage(1, true);
  } else {
    loadCatalogPage(state.currentPage + 1, false);
  }
}

export function renderSeriesCards(items) {
  el.seriesGrid.innerHTML = '';
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'series-card';
    card.onclick = () => {
      if (openSeriesHandler) {
        openSeriesHandler(item.id);
      }
    };

    const coverUrl = item.cover_url || '';
    const epLabel = item.episode_count ? `全${item.episode_count}集` : '';
    const heat = item.heat ? `🔥 ${formatHeat(item.heat)}` : '';
    const tags = (item.tags || []).slice(0, 2).map((t) => `<span class="card-tag">${escapeHtml(t)}</span>`).join('');
    const fav = isFavorited(item.id);

    card.innerHTML = `
      <div class="card-poster-wrapper">
        <img class="card-poster" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(item.title || '短剧')}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 400%22><rect width=%22300%22 height=%22400%22 fill=%22%23222%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23888%22 font-size=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>红果短剧</text></svg>'">
        <button class="card-fav-btn ${fav ? 'active' : ''}" data-series-id="${escapeHtml(item.id)}" title="${fav ? '已收藏 (点击取消)' : '加入收藏'}" type="button">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="${fav ? '#fadb14' : 'none'}" stroke="${fav ? '#fadb14' : '#ffffff'}" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>
        ${epLabel ? `<span class="card-badge-top">${escapeHtml(epLabel)}</span>` : ''}
        ${item.status === 0 ? `<span class="card-badge-bottom">连载中</span>` : ''}
      </div>
      <div class="card-info">
        <h3 class="card-title" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || '未知剧名')}</h3>
        <div class="card-meta-row">
          <div class="card-tags">${tags}</div>
          <span class="card-heat">${heat}</span>
        </div>
      </div>
    `;

    const favBtn = card.querySelector('.card-fav-btn');
    if (favBtn) {
      favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(item);
      };
    }
    el.seriesGrid.appendChild(card);
  });
}

export function updatePaginationUI() {
  if (!el.paginationContainer) return;
  const curPage = state.currentPage;
  const pageData = state.pageStack[curPage - 1];

  if (!pageData || !pageData.items || pageData.items.length === 0) {
    el.paginationContainer.style.display = 'none';
    return;
  }

  el.paginationContainer.style.display = 'flex';
  el.pgCurrentPage.textContent = curPage;

  // Previous Page disabled on page 1 or during active loading
  el.btnPagePrev.disabled = state.isLoadingCatalog || curPage <= 1;

  // Next Page disabled if upstream has no more cursor, hasMore is false, or during active loading
  const hasNext = Boolean(pageData.hasMore && pageData.cursor && pageData.cursor.trim() !== '');
  el.btnPageNext.disabled = state.isLoadingCatalog || !hasNext;
}
