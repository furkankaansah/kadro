import { state } from './state.js';

async function request(method, url, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.clientId) headers['X-Client-Id'] = state.clientId;

  let res;
  try {
    res = await fetch('/api' + url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    const err = new Error('network');
    err.code = 'network';
    throw err;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* gövde yok */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'request_failed');
    err.code = (data && data.error) || 'request_failed';
    err.status = res.status;
    err.data = data || {}; // sunucunun ek alanları (ör. yasak nedeni)
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};

/** { a: 1, b: '' } -> "?a=1" (boş değerleri atar) */
export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined || v === false) continue;
    p.set(k, v === true ? '1' : String(v));
  }
  const s = p.toString();
  return s ? '?' + s : '';
}
