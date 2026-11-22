import { getLanguage } from './i18n.js';

let csrfToken;

export class ApiError extends Error {
  constructor(message, status, fields = {}) { super(message); this.status = status; this.fields = fields; }
}

export async function api(path, { method = 'GET', body, timeout = 15000 } = {}) {
  if (method !== 'GET' && !csrfToken) await api('/auth/session');
  const headers = { 'Accept-Language': getLanguage() };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken || '';
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin',
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch { throw new ApiError('Cannot connect to RosterLink. Check your connection and try again.', 0); }
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    // An expired cookie can fail CSRF validation before it reaches requireUser.
    // Recheck the session, but never replay a mutation automatically.
    if (response.status === 403 && data.message === 'Your session changed. Refresh the page and try again.') {
      const session = await api('/auth/session').catch(() => null);
      if (session && !session.user) window.dispatchEvent(new Event('session-expired'));
    }
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(data.message || 'The request failed. Please try again.', response.status, data.fields);
  }
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data;
}

export async function uploadPost(path, method, body, onProgress) {
  if (!csrfToken) await api('/auth/session');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, '/api' + path);
    xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.responseType = 'json';
    xhr.timeout = 120000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded * 100 / event.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
      else reject(new ApiError(xhr.response?.message || 'Upload failed. Try again.', xhr.status, xhr.response?.fields));
    };
    xhr.onerror = xhr.ontimeout = () => reject(new ApiError('Connection interrupted. Your draft is ready to retry.', 0));
    xhr.send(body);
  });
}

export async function endSession() {
  await api('/auth/logout', { method: 'POST' });
  csrfToken = undefined;
}
