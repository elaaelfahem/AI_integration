import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth/auth-layout';
import { getServerMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getServerMessages();
  return { title: meta.inviteTitle, description: meta.inviteDescription };
}

export default async function InviteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { invitation } = await getServerMessages();
  return <AuthLayout formLabel={invitation.acceptTitle}>{children}</AuthLayout>;
}
