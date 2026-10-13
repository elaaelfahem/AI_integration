'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { WarningIcon } from './warning-icon';

type ToastVariant = 'success' | 'error' | 'warning';

interface ToastProps {
  variant: ToastVariant;
  message: string;
  onDismiss: () => void;
  offset?: number;
}

const TOAST_DURATION_MS = 3000;
const SWIPE_DISMISS_THRESHOLD_PX = 80;

export function Toast({ variant, message, onDismiss, offset = 0 }: ToastProps) {
  const { messages } = useI18n();
  const [dragX, setDragX] = useState(0);
  const dragStartX = useRef<number | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [onDismiss]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.app-toast-close')) {
      return;
    }
    dragStartX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragStartX.current === null) {
      return;
    }
    setDragX(event.clientX - dragStartX.current);
  }

  function handlePointerUp() {
    if (dragStartX.current === null) {
      return;
    }
    dragStartX.current = null;

    if (Math.abs(dragX) > SWIPE_DISMISS_THRESHOLD_PX) {
      onDismiss();
    } else {
      setDragX(0);
    }
  }

  return (
    <div
      className={`app-toast app-toast-${variant}`}
      role="status"
      aria-live="polite"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        top: offset ? `calc(1.25rem + ${offset}rem)` : undefined,
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        opacity: dragX ? Math.max(0, 1 - Math.abs(dragX) / 200) : undefined,
      }}
    >
      <span className="app-toast-icon" aria-hidden="true">
        {variant === 'success' ? (
          <CheckIcon />
        ) : variant === 'warning' ? (
          <WarningIcon />
        ) : (
          <CrossIcon />
        )}
      </span>
      <span className="app-toast-message">{message}</span>
      <button
        type="button"
        className="app-toast-close"
        onClick={onDismiss}
        aria-label={messages.common.close}
      >
        <CrossIcon />
      </button>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 12.5 9.5 18 20 6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 5 19 19M19 5 5 19"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
