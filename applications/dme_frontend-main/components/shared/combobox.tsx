'use client';

import { useEffect, useRef, useState } from 'react';

export function Combobox({
  items,
  value,
  onChange,
  placeholder,
  disabled,
  required,
  id,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}) {
  const selected = items.find((item) => item.id === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);
  const ref = useRef<HTMLDivElement | null>(null);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setQuery(selected?.label ?? '');
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(selected?.label ?? '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, selected?.label]);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? items.filter((item) => item.label.toLowerCase().includes(trimmed))
    : items;

  return (
    <div className="company-combobox" ref={ref}>
      <input
        id={id}
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        required={required}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) onChange('');
        }}
      />
      {open && filtered.length ? (
        <ul className="company-combobox-list" role="listbox">
          {filtered.slice(0, 40).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={item.id === value}
                onClick={() => {
                  onChange(item.id);
                  setQuery(item.label);
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
