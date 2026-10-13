'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';
import { BrandMark } from '../dashboard';
import { AuthLayout } from './auth-layout';
import { LoginForm } from './login-form';
import { SetupPasswordForm } from './setup-password-form';
import { useI18n } from '@/lib/i18n/i18n-context';

export function AuthScreen() {
  const router = useRouter();
  const { account, passwordSetupChallenge, status } = useAuth();
  const t = useI18n().messages.authScreen;

  useEffect(() => {
    if (status === 'authenticated' && account) {
      router.replace('/dashboard');
    }
  }, [status, account, router]);

  if (status === 'loading' || status === 'authenticated') {
    return (
      <main className="loading-screen" aria-busy="true" aria-label={t.loading}>
        <BrandMark />
        <div className="loading-line" />
        <p
          style={{
            marginTop: '1.2rem',
            color: '#555',
            fontSize: '0.95rem',
            fontWeight: 600,
          }}
        >
          {status === 'loading' ? t.checkingSession : t.redirecting}
        </p>
      </main>
    );
  }

  return (
    <AuthLayout
      formLabel={passwordSetupChallenge ? t.setupFormLabel : t.loginFormLabel}
    >
      {passwordSetupChallenge ? <SetupPasswordForm /> : <LoginForm />}
    </AuthLayout>
  );
}
