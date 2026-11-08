// OpenHongguo Web - Navigation & Search Header Interactions

import { state, el } from './state.js';
import {
  showSearchHistory,
  hideSearchHistory,
  clearSearchHistory,
} from './search_history.js';
import { switchToCatalog } from './theater_layout.js';

let onSearchSubmit = null;
let onChannelSelect = null;

export function setNavigationCallbacks({ onSearch, onChannel }) {
  if (onSearch) onSearchSubmit = onSearch;
  if (onChannel) onChannelSelect = onChannel;
}

export function initNavigation() {
  const app = document.getElementById('app');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');

  // Sidebar Collapse / Expand (Desktop)
  if (el.btnSidebarCollapse && app) {
    el.btnSidebarCollapse.onclick = () => {
      if (window.innerWidth <= 768) {
        app.classList.remove('sidebar-mobile-open');
      } else {
        app.classList.add('sidebar-collapsed');
      }
    };
  }

  // Sidebar Toggle (Mobile / Topbar)
  if (el.btnSidebarToggle && app) {
    el.btnSidebarToggle.onclick = () => {
      if (window.innerWidth <= 768) {
        app.classList.toggle('sidebar-mobile-open');
      } else {
        app.classList.toggle('sidebar-collapsed');
      }
    };
  }

  // Mobile Sidebar Backdrop Click
  if (sidebarBackdrop && app) {
    sidebarBackdrop.onclick = () => {
      app.classList.remove('sidebar-mobile-open');
    };
  }

  // Brand / Home Button
  if (el.btnHome) {
    el.btnHome.onclick = () => {
      state.searchQuery = '';
      el.searchInput.value = '';
      el.searchClear.style.display = 'none';
      el.catalogFilters.style.display = 'none';
      if (window.innerWidth <= 768 && app) {
        app.classList.remove('sidebar-mobile-open');
      }
      const firstTab = el.navChannels.querySelector('.nav-tab');
      if (firstTab) firstTab.click();
    };
  }

  // Channel Tabs Navigation
  if (el.navChannels) {
    el.navChannels.addEventListener('click', (e) => {
      const tab = e.target.closest('.nav-tab');
      if (!tab) return;
      el.navChannels.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      if (window.innerWidth <= 768 && app) {
        app.classList.remove('sidebar-mobile-open');
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
      if (onChannelSelect) onChannelSelect();
    });
  }

  // Search Input Controls
  if (el.searchSubmit) {
    el.searchSubmit.onclick = () => {
      if (onSearchSubmit) onSearchSubmit();
    };
  }

  if (el.searchInput) {
    el.searchInput.onkeydown = (e) => {
      if (e.key === 'Enter' && onSearchSubmit) onSearchSubmit();
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
  }

  if (el.searchClear) {
    el.searchClear.onclick = () => {
      el.searchInput.value = '';
      el.searchClear.style.display = 'none';
      hideSearchHistory();
      if (el.btnHome) el.btnHome.click();
    };
  }

  if (el.btnClearSearchHistory) {
    el.btnClearSearchHistory.onclick = (e) => {
      e.stopPropagation();
      clearSearchHistory();
    };
  }

  // Hide Search History Dropdown on Outside Click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.header-search')) {
      hideSearchHistory();
    }
  });

  // Filter chips in search mode
  if (el.catalogFilters) {
    el.catalogFilters.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      el.catalogFilters.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.searchFilter = chip.dataset.filter;
      if (onChannelSelect) onChannelSelect();
    });
  }
}
