'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { AuthLayout } from './auth-layout';
import { OtpForm } from './otp-form';

export function OtpScreen() {
  const { messages } = useI18n();

  return (
    <AuthLayout formLabel={messages.otp.sendingHeading}>
      <OtpForm />
    </AuthLayout>
  );
}
