let csrfToken;

export class ApiError extends Error {
  constructor(message, status, fields = {}) { super(message); this.status = status; this.fields = fields; }
}

export async function api(path, { method = 'GET', body, timeout = 15000 } = {}) {
  if (method !== 'GET' && !csrfToken) await api('/auth/session');
  const headers = {};
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

export async function endSession() {
  await api('/auth/logout', { method: 'POST' });
  csrfToken = undefined;
}
