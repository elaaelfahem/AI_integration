'use client';

import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousemove',
  'keydown',
  'click',
  'scroll',
];

export function useActivityMonitor(
  enabled: boolean,
  touchIntervalMs: number | null,
  onActivity: () => Promise<void>,
) {
  const lastTouch = useRef<number | null>(null);
  const activityHandler = useRef(onActivity);

  useEffect(() => {
    activityHandler.current = onActivity;
  }, [onActivity]);

  useEffect(() => {
    if (!enabled || !touchIntervalMs) {
      lastTouch.current = null;
      return;
    }

    const handleActivity = () => {
      const now = performance.now();

      if (
        document.visibilityState !== 'visible' ||
        (lastTouch.current !== null &&
          now - lastTouch.current < touchIntervalMs)
      ) {
        return;
      }

      lastTouch.current = now;
      void activityHandler.current();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [enabled, touchIntervalMs]);
}
