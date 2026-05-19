const STORAGE_KEY = 'callnest:dialer-theme';

/** @typedef {'light' | 'dark'} DialerTheme */

/** @returns {DialerTheme} */
export function getDialerTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // ignore
  }
  return 'dark';
}

/** @param {DialerTheme} theme */
export function persistDialerTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}
