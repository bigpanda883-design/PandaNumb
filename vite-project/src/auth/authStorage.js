const AUTH_STORAGE_KEY = "panda-numbers-auth";

export function getAuthUser() {
  try {
    const storedUser = localStorage.getItem(AUTH_STORAGE_KEY);
    return storedUser ? JSON.parse(storedUser) : null;
  } catch {
    return null;
  }
}

export function setAuthUser(user) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

export function clearAuthUser() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function isAuthenticated() {
  return Boolean(getAuthUser());
}
