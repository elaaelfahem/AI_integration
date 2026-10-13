import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getServerMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getServerMessages();
  return { title: meta.usersTitle, description: meta.usersDescription };
}

export default function UsersLayout({ children }: { children: ReactNode }) {
  return children;
}
