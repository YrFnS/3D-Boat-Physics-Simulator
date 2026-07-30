'use client';

import { useEffect, useState } from 'react';

const DEBUG_STORAGE_KEY = 'boat-simulator-debug';

function isEnabledByQuery() {
  const value = new URLSearchParams(window.location.search).get('debug');
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return null;
}

/**
 * Enables diagnostics automatically in development and opt-in in production.
 *
 * Production diagnostics can be enabled with `?debug=1`. The preference is
 * remembered until a visit with `?debug=0` clears it.
 */
export function useDebugMode() {
  const [enabled, setEnabled] = useState(
    process.env.NODE_ENV !== 'production',
  );

  useEffect(() => {
    const queryPreference = isEnabledByQuery();

    try {
      if (queryPreference === true) {
        window.localStorage.setItem(DEBUG_STORAGE_KEY, '1');
      } else if (queryPreference === false) {
        window.localStorage.removeItem(DEBUG_STORAGE_KEY);
      }

      setEnabled(
        process.env.NODE_ENV !== 'production' ||
          queryPreference === true ||
          (queryPreference === null &&
            window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1'),
      );
    } catch {
      setEnabled(
        process.env.NODE_ENV !== 'production' || queryPreference === true,
      );
    }
  }, []);

  return enabled;
}
