'use client';

import { useEffect, useRef } from 'react';

const EXPIRY_CHECK_INTERVAL_MS = 1_000;

export interface SessionTiming {
  idleExpiresInMs: number;
  touchIntervalMs: number;
  synchronizedAt: number;
}

export function useSessionExpiry(
  enabled: boolean,
  timing: SessionTiming | null,
  isSynchronizing: () => boolean,
  onExpire: () => void,
) {
  const expiryHandler = useRef(onExpire);
  const synchronizationCheck = useRef(isSynchronizing);

  useEffect(() => {
    expiryHandler.current = onExpire;
    synchronizationCheck.current = isSynchronizing;
  }, [isSynchronizing, onExpire]);

  useEffect(() => {
    if (!enabled || !timing) {
      return;
    }

    let hasExpired = false;
    const expiresAt = timing.synchronizedAt + timing.idleExpiresInMs;

    const checkSession = () => {
      if (
        hasExpired ||
        performance.now() < expiresAt ||
        synchronizationCheck.current()
      ) {
        return;
      }

      hasExpired = true;
      expiryHandler.current();
    };

    checkSession();
    const interval = window.setInterval(checkSession, EXPIRY_CHECK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [enabled, timing]);
}
