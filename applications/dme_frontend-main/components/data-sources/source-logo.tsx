'use client';

import { useState, type CSSProperties } from 'react';

export function SourceLogo({
  logoUrl,
  name,
  size = 40,
  style,
  className,
}: {
  logoUrl?: string | null;
  name: string;
  size?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (logoUrl && !hasError) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          padding: 4,
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={name}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
          onError={() => setHasError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || 'S';

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        color: '#475569',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: Math.max(12, Math.round(size * 0.38)),
        flexShrink: 0,
        ...style,
      }}
      aria-label={name}
    >
      {initial}
    </div>
  );
}
