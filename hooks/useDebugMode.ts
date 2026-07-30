'use client';

import { useEffect, useSyncExternalStore } from 'react';

const DEBUG_STORAGE_KEY = 'boat-simulator-debug';
const DEBUG_CHANGE_EVENT = 'boat-simulator-debug-change';

function queryPreference() {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('debug');
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return null;
}

function getClientSnapshot() {
  if (process.env.NODE_ENV !== 'production') return true;

  const preference = queryPreference();
  if (preference !== null) return preference;

  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return process.env.NODE_ENV !== 'production';
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => undefined;

  window.addEventListener('popstate', onStoreChange);
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(DEBUG_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(DEBUG_CHANGE_EVENT, onStoreChange);
  };
}

/**
 * Enables diagnostics automatically in development and opt-in in production.
 *
 * Production diagnostics can be enabled with `?debug=1`. The preference is
 * remembered until a visit with `?debug=0` clears it.
 */
export function useDebugMode() {
  const enabled = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    const preference = queryPreference();
    if (preference === null) return;

    try {
      if (preference) {
        window.localStorage.setItem(DEBUG_STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(DEBUG_STORAGE_KEY);
      }
      window.dispatchEvent(new Event(DEBUG_CHANGE_EVENT));
    } catch {
      // Query-string debug mode still works when storage is unavailable.
    }
  }, []);

  return enabled;
}
