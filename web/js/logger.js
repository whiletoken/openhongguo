// OpenHongguo Web - Unified Logger & Exception Monitor

const LOG_HISTORY_LIMIT = 100;
const logHistory = [];
let lastErrorTime = 0;
let lastErrorMsg = '';

function formatTimestamp() {
  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function pushHistory(level, tag, message, extra) {
  if (logHistory.length >= LOG_HISTORY_LIMIT) {
    logHistory.shift();
  }
  logHistory.push({
    time: formatTimestamp(),
    level,
    tag,
    message,
    extra,
  });
}

function showToast(message, type = 'error') {
  // Prevent duplicate spam within 3 seconds
  const now = Date.now();
  if (message === lastErrorMsg && now - lastErrorTime < 3000) {
    return;
  }
  lastErrorMsg = message;
  lastErrorTime = now;

  let container = document.getElementById('ohg-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ohg-toast-container';
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 420px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `ohg-toast ohg-toast-${type}`;
  toast.style.cssText = `
    background: ${type === 'error' ? 'rgba(220, 38, 38, 0.95)' : 'rgba(30, 41, 59, 0.95)'};
    color: #fff;
    padding: 12px 18px;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    font-size: 13px;
    line-height: 1.5;
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    transition: all 0.3s ease;
    transform: translateY(10px);
    opacity: 0;
  `;

  const icon = type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `
    <span style="font-size: 16px; flex-shrink: 0;">${icon}</span>
    <div style="flex: 1; word-break: break-word;">${escapeHtml(message)}</div>
    <button style="background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 16px; padding: 0;" aria-label="关闭">&times;</button>
  `;

  const closeBtn = toast.querySelector('button');
  const dismiss = () => {
    toast.style.transform = 'translateY(10px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  };
  closeBtn.onclick = dismiss;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(dismiss, 5000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const Logger = {
  debug(tag, message, ...args) {
    const ts = formatTimestamp();
    pushHistory('DEBUG', tag, message, args);
    console.debug(`%c[${ts}] [DEBUG] [${tag}]`, 'color: #888; font-weight: bold;', message, ...args);
  },

  info(tag, message, ...args) {
    const ts = formatTimestamp();
    pushHistory('INFO', tag, message, args);
    console.info(`%c[${ts}] [INFO] [${tag}]`, 'color: #0284c7; font-weight: bold;', message, ...args);
  },

  warn(tag, message, ...args) {
    const ts = formatTimestamp();
    pushHistory('WARN', tag, message, args);
    console.warn(`%c[${ts}] [WARN] [${tag}]`, 'color: #d97706; font-weight: bold;', message, ...args);
  },

  error(tag, message, ...args) {
    const ts = formatTimestamp();
    pushHistory('ERROR', tag, message, args);
    console.error(`%c[${ts}] [ERROR] [${tag}]`, 'color: #dc2626; font-weight: bold;', message, ...args);
  },

  notifyError(message) {
    this.error('App', message);
    showToast(message, 'error');
  },

  notifyInfo(message) {
    this.info('App', message);
    showToast(message, 'info');
  },

  getRecentLogs() {
    return [...logHistory];
  },

  initGlobalErrorHandler() {
    // 1. Uncaught runtime JavaScript exceptions
    window.addEventListener('error', (event) => {
      const msg = event.message || '未知前端脚本异常';
      const file = event.filename ? event.filename.split('/').pop() : 'script';
      const line = event.lineno || 0;
      const formatted = `[${file}:${line}] ${msg}`;

      Logger.error('WindowError', formatted, event.error);
      showToast(`界面运行时异常: ${msg}`, 'error');
    });

    // 2. Unhandled Promise rejections (e.g., async fetch failures)
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      let msg = '异步调用异常';
      if (typeof reason === 'string') {
        msg = reason;
      } else if (reason && reason.message) {
        msg = reason.message;
      }
      Logger.error('UnhandledRejection', msg, reason);
      showToast(`请求处理异常: ${msg}`, 'error');
    });

    Logger.info('App', '全局异常监听与前端日志系统已启动');
  },
};
