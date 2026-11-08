// OpenHongguo Web - Global & Theater Keyboard Shortcuts Dispatcher

import { state, el } from './state.js';
import { hideSearchHistory } from './search_history.js';
import { closeSettingsModal } from './settings.js';
import { closeFavorites } from './favorites.js';
import { closeHistory } from './history.js';

let artPlayerGetter = null;
let episodeNavCallback = null;

export function setShortcutsDeps({ getArtPlayer, onEpisodeNav }) {
  if (getArtPlayer) artPlayerGetter = getArtPlayer;
  if (onEpisodeNav) episodeNavCallback = onEpisodeNav;
}

function isTextInputElement(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(target.isContentEditable);
}

function handleEscapeKey() {
  if (el.searchHistoryDropdown && el.searchHistoryDropdown.style.display !== 'none') {
    hideSearchHistory();
    return true;
  }
  if (state.settingsOpen) {
    closeSettingsModal();
    return true;
  }
  if (state.favoritesOpen) {
    closeFavorites();
    return true;
  }
  if (state.historyOpen) {
    closeHistory();
    return true;
  }
  return false;
}

function handleTheaterShortcuts(e, art) {
  const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.keyCode === 32;

  if (isSpace || e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    e.stopPropagation();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (typeof art.toggle === 'function') {
      art.toggle();
    } else if (art.video) {
      if (art.video.paused) {
        art.play();
      } else {
        art.pause();
      }
    }
    return;
  }

  switch (e.key) {
    case 'ArrowLeft':
    case 'j':
    case 'J':
      e.preventDefault();
      art.currentTime = Math.max(0, art.currentTime - 5);
      break;
    case 'ArrowRight':
    case 'l':
    case 'L':
      e.preventDefault();
      art.currentTime = Math.min(art.duration || 9999, art.currentTime + 5);
      break;
    case 'ArrowUp':
      e.preventDefault();
      art.volume = Math.min(1, Number((art.volume + 0.1).toFixed(2)));
      break;
    case 'ArrowDown':
      e.preventDefault();
      art.volume = Math.max(0, Number((art.volume - 0.1).toFixed(2)));
      break;
    case 'm':
    case 'M':
      e.preventDefault();
      art.muted = !art.muted;
      break;
    case '[':
      e.preventDefault();
      if (episodeNavCallback) episodeNavCallback(-1);
      break;
    case ']':
      e.preventDefault();
      if (episodeNavCallback) episodeNavCallback(1);
      break;
    case 'f':
    case 'F':
      e.preventDefault();
      art.fullscreen = !art.fullscreen;
      break;
  }
}

export function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // 1. If focused in text input, suppress shortcuts except Escape blur
    if (isTextInputElement(e.target)) {
      if (e.key === 'Escape') {
        hideSearchHistory();
        e.target.blur();
      }
      return;
    }

    // 2. Global ESC handling (closing dropdowns/drawers/modals)
    if (e.key === 'Escape') {
      if (handleEscapeKey()) return;
    }

    // 3. Theater Mode Shortcuts
    const art = artPlayerGetter ? artPlayerGetter() : null;
    if (el.viewTheater && el.viewTheater.style.display !== 'none' && art) {
      handleTheaterShortcuts(e, art);
    }
  });
}
