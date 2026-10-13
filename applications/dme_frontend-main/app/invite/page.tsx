'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';
import { InvitationForm } from '@/components/auth/invitation-form';
import { SetupPasswordForm } from '@/components/auth/setup-password-form';
import { useI18n } from '@/lib/i18n/i18n-context';

export default function InvitePage() {
  return (
    <Suspense fallback={<InviteLoading />}>
      <InviteContent />
    </Suspense>
  );
}

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim();
  const { status, passwordSetupChallenge } = useAuth();
  const t = useI18n().messages.invitation;

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [router, status]);

  if (status === 'authenticated') {
    return <InviteLoading />;
  }

  if (passwordSetupChallenge) {
    return <SetupPasswordForm />;
  }

  if (token) {
    return <InvitationForm token={token} />;
  }

  return (
    <div className="login-form">
      <h1 className="form-heading">{t.missingTitle}</h1>
      <p className="form-intro">{t.missingIntro}</p>
    </div>
  );
}

function InviteLoading() {
  const t = useI18n().messages.invitation;
  return (
    <div className="login-form" role="status" aria-live="polite">
      <div>
        <h1 className="form-heading">{t.loadingTitle}</h1>
        <p className="form-intro">{t.loadingIntro}</p>
      </div>
    </div>
  );
}
