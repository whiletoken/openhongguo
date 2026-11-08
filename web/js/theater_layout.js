// OpenHongguo Web - Theater View & Adaptive Layout Subsystem

import { state, el } from './state.js';
import { showToast } from './utils.js';
import { startCachePolling, stopCachePolling } from './cache_sync.js';

let artPlayerGetter = null;

export function setArtPlayerGetter(fn) {
  artPlayerGetter = fn;
}

function getArt() {
  return artPlayerGetter ? artPlayerGetter() : null;
}

/**
 * Transitions application view to Theater mode
 */
export function switchToTheater() {
  el.viewCatalog.style.display = 'none';
  el.viewTheater.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  startCachePolling();
}

/**
 * Transitions application view back to Catalog mode
 */
export function switchToCatalog() {
  if (state.loadingTimer) {
    clearTimeout(state.loadingTimer);
    state.loadingTimer = null;
  }
  el.videoLoading.style.display = 'none';
  const art = getArt();
  if (art) art.pause();
  el.viewTheater.style.display = 'none';
  el.viewCatalog.style.display = 'block';
  stopCachePolling();
}

/**
 * Toggles the visibility of the right-side episodes panel
 */
export function toggleEpisodesHidden(force) {
  const container = el.theaterContainer;
  if (!container) return;

  const isHidden = typeof force === 'boolean' ? force : !container.classList.contains('episodes-hidden');
  container.classList.toggle('episodes-hidden', isHidden);

  if (el.btnToggleEpisodesTop) {
    el.btnToggleEpisodesTop.classList.toggle('active', isHidden);
    el.btnToggleEpisodesTop.title = isHidden ? '展开选集面板' : '收起选集面板';
  }

  if (el.btnToggleEpisodesBar) {
    el.btnToggleEpisodesBar.classList.toggle('active', isHidden);
  }

  const art = getArt();
  if (art && typeof art.resize === 'function') {
    setTimeout(() => art.resize(), 260);
  }
}

/**
 * Applies video display aspect ratio mode
 */
export function applyAspectRatio(mode = 'auto') {
  state.aspectRatio = mode;
  try {
    localStorage.setItem('ohg_aspect_ratio', mode);
  } catch (e) {}

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
  const art = getArt();

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

/**
 * Toggles wide theater layout
 */
export function toggleTheaterWide(force) {
  state.theaterWide = typeof force === 'boolean' ? force : !state.theaterWide;
  try {
    localStorage.setItem('ohg_theater_wide', state.theaterWide ? 'true' : 'false');
  } catch (e) {}

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

  const art = getArt();
  if (art) {
    setTimeout(() => {
      try {
        art.resize();
      } catch (e) {}
    }, 120);
  }
}

/**
 * Restores user layout preferences and sets up resize observers
 */
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
      const art = getArt();
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

/**
 * Binds theater layout toggle and button click events
 */
export function bindTheaterLayoutEvents() {
  if (el.btnPlayerBack) {
    el.btnPlayerBack.onclick = switchToCatalog;
  }
  if (el.selectAspectRatio) {
    el.selectAspectRatio.onchange = () => {
      applyAspectRatio(el.selectAspectRatio.value);
    };
  }
  if (el.btnTheaterMode) {
    el.btnTheaterMode.onclick = () => {
      toggleTheaterWide();
    };
  }
  if (el.btnHideEpisodes) {
    el.btnHideEpisodes.onclick = () => {
      toggleEpisodesHidden(true);
    };
  }
  if (el.btnToggleEpisodesTop) {
    el.btnToggleEpisodesTop.onclick = () => {
      toggleEpisodesHidden();
    };
  }
  if (el.btnToggleEpisodesBar) {
    el.btnToggleEpisodesBar.onclick = () => {
      toggleEpisodesHidden();
    };
  }
}
