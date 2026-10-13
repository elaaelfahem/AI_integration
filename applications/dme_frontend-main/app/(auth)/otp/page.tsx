import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth/auth-layout';
import { OtpForm } from '@/components/auth/otp-form';
import { getServerMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getServerMessages();
  return { title: meta.otpTitle, description: meta.otpDescription };
}

export default async function OtpPage() {
  const { otp } = await getServerMessages();
  return (
    <AuthLayout formLabel={otp.sendingHeading}>
      <OtpForm />
    </AuthLayout>
  );
}
