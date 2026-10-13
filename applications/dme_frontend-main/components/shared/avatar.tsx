'use client';

import { useEffect, useState } from 'react';
import { authApi } from '@/lib/api';

export function Avatar({
  userId,
  hasAvatar,
  firstName,
  lastName,
  className,
  refreshKey,
}: {
  userId: string;
  hasAvatar?: boolean;
  firstName: string;
  lastName: string;
  className?: string;
  refreshKey?: number;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAvatar) {
      const timer = window.setTimeout(() => setImageUrl(null), 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    authApi
      .getAvatar(userId)
      .then(({ blob }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => setImageUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, hasAvatar, refreshKey]);

  return (
    <div
      className={className ? `profile-avatar ${className}` : 'profile-avatar'}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="profile-avatar-image" />
      ) : (
        <>
          {firstName.charAt(0)}
          {lastName.charAt(0)}
        </>
      )}
    </div>
  );
}
