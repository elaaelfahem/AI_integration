import type { Metadata } from 'next';
import { AuthScreen } from '@/components/auth/auth-screen';
import { getServerMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { login, meta } = await getServerMessages();
  return { title: login.pageTitle, description: meta.loginDescription };
}

export default function LoginPage() {
  return <AuthScreen />;
}
