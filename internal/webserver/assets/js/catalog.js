// OpenHongguo Web - Catalog & Pagination Module

import { state, el } from './state.js';
import { apiGet } from './api.js';
import { escapeHtml, showToast, formatHeat } from './utils.js';

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
    if (!prevData || !prevData.hasMore || !prevData.cursor) {
      return; // No more pages
    }
    cursor = prevData.cursor;
  }

  state.isLoadingCatalog = true;
  el.gridLoader.style.display = 'flex';

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
    const hasMore = !!(page.has_more || (page.cursor && page.cursor !== ''));
    const nextCursor = page.cursor || '';

    state.pageStack[targetPage - 1] = {
      items: items,
      cursor: nextCursor,
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
    }
  } catch (err) {
    showToast('加载失败: ' + err.message, 'error');
    if (state.pageStack.length === 0) {
      el.gridEmpty.style.display = 'flex';
    }
  } finally {
    state.isLoadingCatalog = false;
    el.gridLoader.style.display = 'none';
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

    card.innerHTML = `
      <div class="card-poster-wrapper">
        <img class="card-poster" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(item.title || '短剧')}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 400%22><rect width=%22300%22 height=%22400%22 fill=%22%23222%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23888%22 font-size=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>红果短剧</text></svg>'">
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

  // Previous Page disabled on page 1
  el.btnPagePrev.disabled = curPage <= 1;

  // Next Page disabled if upstream has no more cursor
  const hasNext = pageData.hasMore && !!pageData.cursor;
  el.btnPageNext.disabled = !hasNext;
}
