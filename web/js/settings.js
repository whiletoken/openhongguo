// OpenHongguo Web - Server Connection Settings Module

import { state, el } from './state.js';
import {
  getServerUrl,
  setServerUrl,
  resetServerUrl,
  testServerConnection,
  normalizeServerUrl,
} from './api.js';
import { showToast, escapeHtml } from './utils.js';

let reloadAppHandler = null;

export function setReloadAppHandler(fn) {
  reloadAppHandler = fn;
}

export function openSettingsModal() {
  if (!el.settingsModal) return;
  state.settingsOpen = true;

  if (el.inputServerUrl) {
    el.inputServerUrl.value = getServerUrl();
  }
  if (el.testConnectionResult) {
    el.testConnectionResult.innerHTML = '';
  }

  el.settingsModal.classList.add('open');
  if (el.drawerOverlay) el.drawerOverlay.classList.add('open');

  // Automatically test connection to current server
  handleTestConnection(false);
}

export function closeSettingsModal() {
  if (!el.settingsModal) return;
  state.settingsOpen = false;
  el.settingsModal.classList.remove('open');
  if (!state.historyOpen && !state.favoritesOpen && el.drawerOverlay) {
    el.drawerOverlay.classList.remove('open');
  }
}

export async function handleTestConnection(showFeedbackToast = true) {
  if (!el.inputServerUrl || !el.testConnectionResult) return;
  const target = el.inputServerUrl.value.trim();
  if (!target) {
    el.testConnectionResult.innerHTML = `<span class="result-badge error">请输入服务端地址</span>`;
    return;
  }

  el.testConnectionResult.innerHTML = `
    <span class="result-badge testing">
      <span class="spinner-small"></span>
      正在测试与服务端的连接...
    </span>
  `;

  const res = await testServerConnection(target);
  if (res.ok) {
    const ffmpegReady = res.data && res.data.tools && res.data.tools.ffmpeg_ready;
    const cacheCount = (res.data && res.data.cache && res.data.cache.file_count) || 0;
    el.testConnectionResult.innerHTML = `
      <div class="test-success-card">
        <div class="result-badge success">✅ 成功连接至服务端 (响应耗时 ${res.latency}ms)</div>
        <div class="server-diag-details">
          <span>解密工具: ${ffmpegReady ? '⚡ FFmpeg 已就绪' : '⚠️ 未检测到 FFmpeg'}</span>
          <span>服务端缓存: ${cacheCount} 个媒体文件</span>
        </div>
      </div>
    `;
    if (showFeedbackToast) {
      showToast(`连接成功: ${normalizeServerUrl(target)}`, 'success');
    }
  } else {
    el.testConnectionResult.innerHTML = `
      <div class="result-badge error">
        ❌ 连接失败: ${escapeHtml(res.error)}
      </div>
      <div class="server-error-tip">
        提示：请检查服务端程序 (ohg-server) 是否正在运行、端口是否被占用，或局域网防火墙是否允许访问。
      </div>
    `;
    if (showFeedbackToast) {
      showToast(`连接失败: ${res.error}`, 'error');
    }
  }
}

export async function handleSaveSettings() {
  if (!el.inputServerUrl) return;
  const target = el.inputServerUrl.value.trim();

  try {
    const saved = setServerUrl(target);
    showToast(`服务端地址已更新为: ${saved}`, 'success');
    closeSettingsModal();

    if (reloadAppHandler) {
      reloadAppHandler();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function handleResetSettings() {
  const def = resetServerUrl();
  if (el.inputServerUrl) {
    el.inputServerUrl.value = def;
  }
  showToast(`已重置为默认服务端地址: ${def}`, 'info');
  handleTestConnection(false);
}

export function initSettingsEvents() {
  if (el.btnSettingsToggle) {
    el.btnSettingsToggle.onclick = openSettingsModal;
  }
  if (el.btnCloseSettings) {
    el.btnCloseSettings.onclick = closeSettingsModal;
  }
  if (el.btnCancelSettings) {
    el.btnCancelSettings.onclick = closeSettingsModal;
  }
  if (el.btnTestConnection) {
    el.btnTestConnection.onclick = () => handleTestConnection(true);
  }
  if (el.btnSaveSettings) {
    el.btnSaveSettings.onclick = handleSaveSettings;
  }
  if (el.btnResetServer) {
    el.btnResetServer.onclick = handleResetSettings;
  }
  if (el.inputServerUrl) {
    el.inputServerUrl.onkeydown = (e) => {
      if (e.key === 'Enter') handleSaveSettings();
    };
  }

  // Click on system status indicator opens settings as well
  if (el.systemStatus) {
    el.systemStatus.style.cursor = 'pointer';
    el.systemStatus.onclick = openSettingsModal;
  }

  // Offline banner actions
  if (el.btnBannerSettings) {
    el.btnBannerSettings.onclick = openSettingsModal;
  }
  if (el.btnBannerRetry) {
    el.btnBannerRetry.onclick = () => {
      if (reloadAppHandler) reloadAppHandler();
    };
  }
}
