'use client';

import { useEffect, useState } from 'react';
import type { SessionTiming } from '@/hooks/use-session-expiry';
import { formatDuration } from '@/components/workspace/formatters';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';

export function DevelopmentSessionTimer({
  timing,
}: {
  timing: SessionTiming | null;
}) {
  const { messages } = useI18n();
  const [remainingMs, setRemainingMs] = useState(
    timing ? getRemainingMs(timing) : 0,
  );

  useEffect(() => {
    if (!timing) {
      queueMicrotask(() => setRemainingMs(0));
      return;
    }

    const updateTimer = () => setRemainingMs(getRemainingMs(timing));

    queueMicrotask(updateTimer);
    const interval = window.setInterval(updateTimer, 250);

    return () => window.clearInterval(interval);
  }, [timing]);

  return (
    <aside
      className="b2b-session-card"
      aria-label={messages.dashboard.devTimerTitle}
    >
      <div>
        <strong>{messages.dashboard.devTimerTitle}</strong>
        <span>{messages.dashboard.devTimerResets}</span>
      </div>
      <div className="b2b-session-values">
        <span>
          {interpolate(messages.dashboard.devTimerLimit, {
            value: formatDuration(timing?.idleExpiresInMs ?? 0),
          })}
        </span>
        <output
          aria-label={interpolate(messages.dashboard.devTimerRemaining, {
            value: formatDuration(remainingMs),
          })}
        >
          {formatDuration(remainingMs)}
        </output>
      </div>
    </aside>
  );
}

function getRemainingMs(timing: SessionTiming) {
  const elapsed = performance.now() - timing.synchronizedAt;
  return Math.max(0, timing.idleExpiresInMs - elapsed);
}
