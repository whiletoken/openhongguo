// OpenHongguo Web - Favorites / Bookmarks Module

import { state, el } from './state.js';
import { apiGet, apiPost, apiDelete } from './api.js';
import { escapeHtml, showToast, formatHeat, formatTimeAgo } from './utils.js';

let openSeriesHandler = null;

export function setOpenSeriesHandler(fn) {
  openSeriesHandler = fn;
}

export function isFavorited(seriesId) {
  if (!seriesId || !state.favorites) return false;
  const sid = String(seriesId);
  return state.favorites.some((f) => String(f.series_id) === sid);
}

export async function fetchFavorites() {
  try {
    const list = await apiGet('/api/favorites');
    state.favorites = Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('Fetch favorites failed:', err);
    state.favorites = state.favorites || [];
  }
  updateBadgeCount();
  updateTheaterFavButton();
  updateCardFavButtons();
}

export async function toggleFavorite(series) {
  if (!series || !series.id) return;
  const id = String(series.id);
  const title = series.title || '该剧';
  const currentlyFav = isFavorited(id);

  if (currentlyFav) {
    try {
      await apiDelete(`/api/favorites?id=${encodeURIComponent(id)}`);
      state.favorites = state.favorites.filter((f) => String(f.series_id) !== id);
      showToast(`已取消收藏「${title}」`, 'info');
    } catch (err) {
      showToast('取消收藏失败: ' + err.message, 'error');
      return;
    }
  } else {
    const entry = {
      series_id: id,
      title: series.title || '',
      cover_url: series.cover_url || '',
      episode_count: series.episode_count || 0,
      heat: series.heat || 0,
      summary: series.summary || '',
      tags: Array.isArray(series.tags) ? series.tags : [],
      created_at: new Date().toISOString(),
    };
    try {
      await apiPost('/api/favorites', entry);
      // Remove any existing copy and prepend to top
      state.favorites = [entry, ...state.favorites.filter((f) => String(f.series_id) !== id)];
      showToast(`⭐ 已将「${title}」加入收藏夹`, 'success');
    } catch (err) {
      showToast('添加收藏失败: ' + err.message, 'error');
      return;
    }
  }

  updateBadgeCount();
  updateTheaterFavButton();
  updateCardFavButtons();

  if (state.favoritesOpen) {
    renderFavoritesList(el.favoritesSearchInput ? el.favoritesSearchInput.value : '');
  }

  // If currently browsing the "收藏" channel tab, update cards
  if (state.channel === '收藏') {
    const customEvent = new CustomEvent('favorites-updated');
    window.dispatchEvent(customEvent);
  }
}

export function openFavorites() {
  state.favoritesOpen = true;
  if (el.favoritesDrawer) el.favoritesDrawer.classList.add('open');
  if (el.drawerOverlay) el.drawerOverlay.classList.add('open');
  if (el.favoritesSearchInput) el.favoritesSearchInput.value = '';
  renderFavoritesList();
  fetchFavorites().then(() => renderFavoritesList());
}

export function closeFavorites() {
  state.favoritesOpen = false;
  if (el.favoritesDrawer) el.favoritesDrawer.classList.remove('open');
  if (!state.historyOpen && el.drawerOverlay) {
    el.drawerOverlay.classList.remove('open');
  }
}

export async function clearFavorites() {
  if (!state.favorites || state.favorites.length === 0) {
    showToast('收藏夹已经是空的了', 'info');
    return;
  }
  if (!confirm(`确定要清空收藏夹中全部 ${state.favorites.length} 部短剧吗？`)) return;

  try {
    await apiDelete('/api/favorites?clear=all');
    state.favorites = [];
    updateBadgeCount();
    renderFavoritesList();
    updateTheaterFavButton();
    updateCardFavButtons();
    showToast('收藏夹已清空', 'info');

    if (state.channel === '收藏') {
      window.dispatchEvent(new CustomEvent('favorites-updated'));
    }
  } catch (err) {
    showToast('清空收藏夹失败: ' + err.message, 'error');
  }
}

export function renderFavoritesList(filterText = '') {
  if (!el.favoritesList) return;
  el.favoritesList.innerHTML = '';

  const q = (filterText || '').trim().toLowerCase();
  const items = (state.favorites || []).filter((item) => {
    if (!q) return true;
    const titleMatch = (item.title || '').toLowerCase().includes(q);
    const tagMatch = (item.tags || []).some((t) => String(t).toLowerCase().includes(q));
    return titleMatch || tagMatch;
  });

  if (items.length === 0) {
    const msg = q ? `未找到匹配“${escapeHtml(q)}”的收藏` : '暂无收藏的短剧，快去发现精彩好剧吧！';
    el.favoritesList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
        <p>${msg}</p>
      </div>
    `;
    return;
  }

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'favorite-item';

    const cover = item.cover_url || '';
    const epLabel = item.episode_count ? `全${item.episode_count}集` : '';
    const heat = item.heat ? `🔥 ${formatHeat(item.heat)}` : '';
    const timeStr = item.created_at ? `${formatTimeAgo(item.created_at)}收藏` : '';

    div.innerHTML = `
      <div class="fav-item-cover-wrapper">
        <img class="fav-item-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(item.title || '')}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 140%22><rect width=%22100%22 height=%22140%22 fill=%22%232a2a2e%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23777%22 font-size=%2212%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>短剧</text></svg>'">
      </div>
      <div class="fav-item-info">
        <div class="fav-item-title" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || '未知剧名')}</div>
        <div class="fav-item-meta">
          ${epLabel ? `<span class="fav-item-ep">${escapeHtml(epLabel)}</span>` : ''}
          ${heat ? `<span class="fav-item-heat">${escapeHtml(heat)}</span>` : ''}
        </div>
        ${timeStr ? `<div class="fav-item-time">${escapeHtml(timeStr)}</div>` : ''}
      </div>
      <div class="fav-item-actions">
        <button class="btn-fav-remove" title="从收藏夹移除" type="button">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    // Click on item body plays the series
    div.onclick = (e) => {
      if (e.target.closest('.btn-fav-remove')) return;
      closeFavorites();
      if (openSeriesHandler) {
        openSeriesHandler(item.series_id);
      }
    };

    // Remove button handler
    const removeBtn = div.querySelector('.btn-fav-remove');
    if (removeBtn) {
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite({ id: item.series_id, title: item.title });
      };
    }

    el.favoritesList.appendChild(div);
  });
}

export function updateBadgeCount() {
  const count = (state.favorites || []).length;
  if (el.favCountBadge) {
    if (count > 0) {
      el.favCountBadge.style.display = 'inline-flex';
      el.favCountBadge.textContent = count > 99 ? '99+' : String(count);
    } else {
      el.favCountBadge.style.display = 'none';
    }
  }
  if (el.favoritesDrawerCount) {
    el.favoritesDrawerCount.textContent = `(${count})`;
  }
}

export function updateTheaterFavButton() {
  if (!el.btnTheaterFav) return;
  if (!state.currentSeries) {
    el.btnTheaterFav.classList.remove('active');
    const label = el.btnTheaterFav.querySelector('.btn-fav-text');
    if (label) label.textContent = '收藏短剧';
    return;
  }

  const fav = isFavorited(state.currentSeries.id);
  el.btnTheaterFav.classList.toggle('active', fav);
  const label = el.btnTheaterFav.querySelector('.btn-fav-text');
  if (label) {
    label.textContent = fav ? '已收藏' : '收藏短剧';
  }
  el.btnTheaterFav.title = fav ? '已加入收藏夹 (点击取消)' : '加入我的收藏夹';
}

export function updateCardFavButtons() {
  const btns = document.querySelectorAll('.card-fav-btn');
  btns.forEach((btn) => {
    const id = btn.dataset.seriesId;
    if (!id) return;
    const fav = isFavorited(id);
    btn.classList.toggle('active', fav);
    btn.title = fav ? '已收藏 (点击取消)' : '加入收藏';
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('fill', fav ? '#fadb14' : 'none');
      svg.setAttribute('stroke', fav ? '#fadb14' : '#ffffff');
    }
  });
}
