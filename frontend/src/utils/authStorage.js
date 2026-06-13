const AUTH_KEYS = ['access_token', 'refresh_token', 'user'];
const TAB_SESSION_KEY = 'tab_session_active';

/** Bootstrap a new tab from shared login without affecting other tabs on logout. */
export function initTabAuth() {
  const hasSession = sessionStorage.getItem('access_token');
  const tabSession = sessionStorage.getItem(TAB_SESSION_KEY);

  if (!hasSession && tabSession !== 'false') {
    AUTH_KEYS.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value) sessionStorage.setItem(key, value);
    });
    if (sessionStorage.getItem('access_token')) {
      sessionStorage.setItem(TAB_SESSION_KEY, 'true');
    }
  }
}

export function getAccessToken() {
  return sessionStorage.getItem('access_token');
}

export function getRefreshToken() {
  return sessionStorage.getItem('refresh_token');
}

export function getStoredUser() {
  const raw = sessionStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuth({ access_token, refresh_token, user }) {
  sessionStorage.setItem('access_token', access_token);
  if (refresh_token) sessionStorage.setItem('refresh_token', refresh_token);
  sessionStorage.setItem('user', JSON.stringify(user));
  sessionStorage.setItem(TAB_SESSION_KEY, 'true');

  localStorage.setItem('access_token', access_token);
  if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function updateAccessToken(access_token) {
  sessionStorage.setItem('access_token', access_token);
  localStorage.setItem('access_token', access_token);
}

/** Log out only the current tab; other tabs keep their session. */
export function clearTabAuth() {
  AUTH_KEYS.forEach((key) => sessionStorage.removeItem(key));
  sessionStorage.setItem(TAB_SESSION_KEY, 'false');
}

export function hasActiveTabSession() {
  return !!getAccessToken() && sessionStorage.getItem(TAB_SESSION_KEY) !== 'false';
}
