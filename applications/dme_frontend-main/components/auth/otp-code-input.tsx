'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { interpolate } from '@/lib/i18n/messages';
import { useI18n } from '@/lib/i18n/i18n-context';

interface OtpCodeInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function OtpCodeInput({
  length,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: OtpCodeInputProps) {
  const { messages } = useI18n();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  function setDigitAt(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join(''));
  }

  function focusInput(index: number) {
    inputRefs.current[index]?.focus();
    inputRefs.current[index]?.select();
  }

  function handleChange(index: number, rawValue: string) {
    const digit = rawValue.replace(/\D/g, '').slice(-1);
    setDigitAt(index, digit);

    if (digit && index < length - 1) {
      focusInput(index + 1);
    }
  }

  function handleKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Backspace') {
      if (digits[index]) {
        setDigitAt(index, '');
        return;
      }

      if (index > 0) {
        event.preventDefault();
        setDigitAt(index - 1, '');
        focusInput(index - 1);
      }
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusInput(index - 1);
      return;
    }

    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      focusInput(index + 1);
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) {
      return;
    }

    event.preventDefault();

    const next = digits.slice();
    let cursor = index;
    for (const char of pasted) {
      if (cursor >= length) {
        break;
      }
      next[cursor] = char;
      cursor += 1;
    }

    onChange(next.join(''));
    focusInput(Math.min(cursor, length - 1));
  }

  return (
    <div className="otp-code-input" role="group" aria-label={ariaLabel}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          className="otp-code-box"
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          disabled={disabled}
          aria-label={interpolate(messages.otp.digitAriaLabel, {
            index: index + 1,
            length,
          })}
        />
      ))}
    </div>
  );
}
