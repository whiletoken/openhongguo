// OpenHongguo Web - HTTP API Client & Dynamic Server Connection Resolver

import { Logger } from './logger.js';

export function normalizeServerUrl(raw) {
  let url = (raw || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url.replace(/\/+$/, '');
}

export function getServerUrl() {
  // 1. URL search param takes highest precedence: ?server=http://...
  try {
    const params = new URLSearchParams(window.location.search);
    const paramServer = params.get('server');
    if (paramServer) {
      const normalized = normalizeServerUrl(paramServer);
      if (normalized) {
        localStorage.setItem('ohg_server_url', normalized);
        return normalized;
      }
    }
  } catch (e) {}

  // 2. Saved user preference in localStorage
  try {
    const saved = localStorage.getItem('ohg_server_url');
    if (saved) {
      const normalized = normalizeServerUrl(saved);
      if (normalized) return normalized;
    }
  } catch (e) {}

  // 3. Fallback to origin if running on web server (unless on client UI port 5211)
  if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
    if (window.location.port === '5211') {
      // Desktop client default backend port is 5210
      return `${window.location.protocol}//${window.location.hostname}:5210`;
    }
    return normalizeServerUrl(window.location.origin);
  }

  // 4. Default fallback
  return 'http://127.0.0.1:5210';
}

export function setServerUrl(url) {
  const normalized = normalizeServerUrl(url);
  if (!normalized) {
    throw new Error('请输入有效的服务端地址 (如 http://127.0.0.1:5210)');
  }
  localStorage.setItem('ohg_server_url', normalized);
  window.dispatchEvent(new CustomEvent('server-url-changed', { detail: { url: normalized } }));
  return normalized;
}

export function resetServerUrl() {
  let defaultUrl = 'http://127.0.0.1:5210';
  if (window.location && window.location.protocol.startsWith('http') && window.location.port !== '5211') {
    defaultUrl = normalizeServerUrl(window.location.origin);
  }
  localStorage.setItem('ohg_server_url', defaultUrl);
  window.dispatchEvent(new CustomEvent('server-url-changed', { detail: { url: defaultUrl } }));
  return defaultUrl;
}

export function buildApiUrl(endpoint) {
  if (!endpoint) return '';
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }
  const base = getServerUrl();
  const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  return `${base}${path}`;
}

export async function testServerConnection(targetUrl) {
  const norm = normalizeServerUrl(targetUrl);
  if (!norm) {
    return { ok: false, error: '地址格式无效' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  const startTime = Date.now();

  try {
    const res = await fetch(`${norm}/api/system/status`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (!res.ok) {
      return { ok: false, error: `服务端返回异常状态码: ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, latency, data };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    return {
      ok: false,
      error: isTimeout ? '连接超时 (4秒内未响应)' : `无法连接到该地址 (${err.message || '网络错误'})`,
    };
  }
}

export async function apiGet(endpoint, options = {}) {
  const fullUrl = buildApiUrl(endpoint);
  const res = await fetch(fullUrl, options);
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
      else if (j.error) msg = j.error;
    } catch (e) {}
    Logger.warn('API', `GET ${endpoint} 失败 [${res.status}]: ${msg}`);
    throw new Error(msg);
  }
  return res.json();
}

export async function apiPost(endpoint, body, options = {}) {
  const fullUrl = buildApiUrl(endpoint);
  const res = await fetch(fullUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body),
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
      else if (j.error) msg = j.error;
    } catch (e) {}
    Logger.warn('API', `POST ${endpoint} 失败 [${res.status}]: ${msg}`);
    throw new Error(msg);
  }
  return res.json();
}

export async function apiDelete(endpoint, options = {}) {
  const fullUrl = buildApiUrl(endpoint);
  const res = await fetch(fullUrl, { method: 'DELETE', ...options });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
      else if (j.error) msg = j.error;
    } catch (e) {}
    Logger.warn('API', `DELETE ${endpoint} 失败 [${res.status}]: ${msg}`);
    throw new Error(msg);
  }
  return res.json();
}
