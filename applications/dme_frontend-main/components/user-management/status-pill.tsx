'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import type { Messages } from '@/lib/i18n/messages';

export function StatusPill({
  value,
}: {
  value:
    | 'INVITED'
    | 'PENDING'
    | 'ACTIVE'
    | 'BLOCKED'
    | 'RESET'
    | 'ADMIN'
    | 'MANAGER'
    | 'AGENT'
    | 'EXPIRED'
    | 'CANCELLED';
}) {
  const { messages } = useI18n();
  return (
    <span className={`b2b-status b2b-status-${value.toLowerCase()}`}>
      {formatStatus(value, messages.statusPill)}
    </span>
  );
}

function formatStatus(value: string, labels: Messages['statusPill']) {
  if (value === 'ADMIN') return labels.admin;
  if (value === 'MANAGER') return labels.manager;
  if (value === 'AGENT') return labels.agent;
  if (value === 'INVITED') return labels.invited;
  if (value === 'PENDING') return labels.pending;
  if (value === 'BLOCKED') return labels.blocked;
  if (value === 'RESET') return labels.reset;
  if (value === 'EXPIRED') return labels.expired;
  if (value === 'CANCELLED') return labels.cancelled;
  return labels.active;
}
