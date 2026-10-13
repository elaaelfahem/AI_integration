import type { Metadata } from 'next';
import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import 'boosted/dist/css/boosted.min.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './globals.css';
import { AuthProvider } from '@/components/auth/auth-provider';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { getServerLocale, getServerMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getServerMessages();
  return {
    title: {
      default: 'DME Workspace — Orange B2B Workspace',
      template: '%s | DME Workspace — Orange B2B Workspace',
    },
    description: meta.appDescription,
    applicationName: 'Orange B2B Workspace',
    referrer: 'strict-origin-when-cross-origin',
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
    icons: {
      icon: '/favicon.ico',
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
  themeColor: '#ff7900',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();

  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body>
        <I18nProvider initialLocale={locale}>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
