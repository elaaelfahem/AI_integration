'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';

interface AuthLayoutProps {
  formLabel: string;
  children: ReactNode;
}

export function AuthLayout({ formLabel, children }: AuthLayoutProps) {
  const { messages } = useI18n();

  return (
    <main className="auth-layout">
      <section className="auth-context" aria-labelledby="auth-context-title">
        <div className="auth-logos">
          <Image
            className="auth-logo-orange"
            src="https://i.ibb.co/SXrHc5Qb/images-1.png"
            alt="Orange"
            width={72}
            height={72}
            priority
          />
          <Image
            className="auth-logo-app"
            src="/logo-orange-b2b.png"
            alt="Orange B2B"
            width={3276}
            height={800}
            priority
          />
        </div>

        <div className="auth-context-content">
          <h2 id="auth-context-title">
            {messages.authLayout.welcomePrefix}
            <br />
            <span className="headline-accent">Orange</span>{' '}
            {messages.authLayout.welcomeSuffix}
          </h2>
        </div>

        <Image
          className="auth-skyline"
          src="/images/frame1.png"
          alt=""
          aria-hidden="true"
          width={841}
          height={339}
          priority
        />
      </section>

      <section className="auth-form-panel" aria-label={formLabel}>
        {children}
      </section>
    </main>
  );
}
