import type React from 'react';
import { I18nProvider } from '~/components/i18n-provider';
import { Footer } from '~/components/layout/footer';
import { Header } from '~/components/layout/header';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <I18nProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </div>
    </I18nProvider>
  );
}
