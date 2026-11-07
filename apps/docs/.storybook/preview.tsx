import '../src/styles/app.css';

import { DocsContainer } from '@storybook/addon-docs/blocks';
import type { Preview } from '@storybook/react-vite';
import React, { useEffect, useState } from 'react';
import { addons } from 'storybook/preview-api';
import { create } from 'storybook/theming/create';

import { storybookLabels } from '../i18n/labels';
import { DEFAULT_LOCALE } from '../i18n/locale';
import { PageTranslationContext } from '../i18n/pageTranslation';
import { StoryLocaleRoot } from '../i18n/StoryLocaleRoot';
import { useStorybookLocale } from '../i18n/useStorybookLocale';
import { DocsFooter } from './DocsFooter';

/** Shared constants — must match manager.jsx */
const STORAGE_KEY = 'tuwa-storybook-theme';
const CHANNEL_EVENT = 'tuwa/set-theme';

/**
 * Resolves the initial theme from sessionStorage (written by the manager only after the user
 * switches the theme) or falls back to system preference.
 */
function getInitialTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'dark') return 'dark';
    if (stored === 'light') return 'light';
    if (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) return 'dark';
  }
  return 'light';
}

/**
 * Applies the theme to the iframe document root.
 */
function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (theme === 'dark') {
    html.classList.add('dark');
    html.style.colorScheme = 'dark';
  } else {
    html.classList.remove('dark');
    html.style.colorScheme = 'light';
  }
}

// ─── Theme Definitions ────────────────────────────────────────────────────────

const LOGO_LIGHT = 'https://tuwa.io/brand/logo_v2.svg';
const LOGO_DARK = 'https://tuwa.io/brand/logo_glow.svg';

const tuwaTheme = create({
  base: 'light',
  brandTitle: 'TUWA Payments',
  brandUrl: 'https://www.tuwa.io/',
  brandImage: LOGO_LIGHT,
  brandTarget: '_self',
  colorPrimary: '#0052ff',
  colorSecondary: '#0284c7',
  appBg: '#ffffff',
  appContentBg: '#ffffff',
  appBorderColor: '#e5e7eb',
  appBorderRadius: 8,
  fontBase: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontCode: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  textColor: '#1f2937',
  textInverseColor: '#ffffff',
  barTextColor: '#6b7280',
  barSelectedColor: '#0052ff',
  barHoverColor: '#0284c7',
  barBg: '#f9fafb',
  inputBg: '#ffffff',
  inputBorder: '#d1d5db',
  inputTextColor: '#1f2937',
  inputBorderRadius: 6,
});

const tuwaDarkTheme = create({
  base: 'dark',
  brandTitle: 'TUWA Payments',
  brandUrl: 'https://www.tuwa.io/',
  brandImage: LOGO_DARK,
  brandTarget: '_self',
  colorPrimary: '#2563eb',
  colorSecondary: '#38bdf8',
  appBg: '#0a0e27',
  appContentBg: '#0d1230',
  appBorderColor: '#1e293b',
  appBorderRadius: 8,
  fontBase: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontCode: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  textColor: '#f1f5f9',
  textInverseColor: '#0a0e27',
  barTextColor: '#94a3b8',
  barSelectedColor: '#38bdf8',
  barHoverColor: '#7dd3fc',
  barBg: '#0a0e27',
  inputBg: '#11183c',
  inputBorder: '#334155',
  inputTextColor: '#f1f5f9',
  inputBorderRadius: 6,
});

// ─── Themed Docs Container ────────────────────────────────────────────────────
// This wraps MDX pages and auto-docs. By using DocsContainer, Storybook natively
// themes the entire Docs UI (tables, backgrounds, copy buttons) perfectly.
// In Ukrainian and Chinese, pages without a translation (the package pages, the API reference and the component
// pages) start with a note that they are in English; `LocalizedPage` of the hand-written pages hides it.

const ThemedDocsContainer = ({ children, context }: any) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const locale = useStorybookLocale();
  const [inSelectedLanguage, setInSelectedLanguage] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let channel: ReturnType<typeof addons.getChannel>;
    try {
      channel = addons.getChannel();
    } catch {
      return;
    }

    const handleThemeChange = (newTheme: string) => {
      setTheme(newTheme === 'dark' ? 'dark' : 'light');
    };

    channel.on(CHANNEL_EVENT, handleThemeChange);
    channel.emit('tuwa/request-theme');

    return () => {
      channel.off(CHANNEL_EVENT, handleThemeChange);
    };
  }, []);

  return (
    <DocsContainer context={context} theme={theme === 'dark' ? tuwaDarkTheme : tuwaTheme}>
      <PageTranslationContext.Provider value={setInSelectedLanguage}>
        {locale !== DEFAULT_LOCALE && !inSelectedLanguage && (
          <p className="sb-unstyled tuwa-docs-note" role="note" lang={locale}>
            {storybookLabels[locale].englishOnly}
          </p>
        )}
        {children}
      </PageTranslationContext.Provider>
      <DocsFooter locale={locale} />
    </DocsContainer>
  );
};

// ─── Theme Injector for Component Previews ────────────────────────────────────
// This decorator ensures the `.dark` class is set on <html> for standard stories.

const ThemeInjector = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let channel: ReturnType<typeof addons.getChannel>;
    try {
      channel = addons.getChannel();
    } catch {
      return;
    }

    const handleThemeChange = (newTheme: string) => {
      setTheme(newTheme === 'dark' ? 'dark' : 'light');
    };

    channel.on(CHANNEL_EVENT, handleThemeChange);
    channel.emit('tuwa/request-theme');

    return () => {
      channel.off(CHANNEL_EVENT, handleThemeChange);
    };
  }, []);

  return <>{children}</>;
};

// Apply theme immediately at module level (before React mounts)
applyTheme(getInitialTheme());

// ─── Preview Configuration ─────────────────────────────────────────────────────

const preview: Preview = {
  parameters: {
    backgrounds: { disable: true },
    // axe runs on every story; `error` fails the story tests (`pnpm test:stories`) on a violation
    // WCAG 2.2 AA too: targets of 24 by 24 px at least (2.5.8)
    a11y: { test: 'error', options: { rules: { 'target-size': { enabled: true } } } },
    docs: {
      container: ThemedDocsContainer,
    },
    options: {
      storySort: {
        order: [
          'Introduction',
          'Nova Payments',
          ['Checkout', 'Refunds'],
          'Packages',
          [
            'Overview',
            'payments-sdk',
            'nova-payments',
            ['Overview', 'payments', ['Overview', '*'], '*', ['Overview', '*']],
            'quasar-sdk',
            ['Overview', 'server', ['Overview', '*'], '*', ['Overview', '*']],
          ],
        ],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    status: {
      statuses: {
        stable: {
          background: '#10b981',
          color: '#ffffff',
          description: 'Stable API',
        },
        beta: {
          background: '#f59e0b',
          color: '#ffffff',
          description: 'Beta version',
        },
        deprecated: {
          background: '#ef4444',
          color: '#ffffff',
          description: 'Will be removed',
        },
      },
    },
  },
  decorators: [
    (Story) => (
      <ThemeInjector>
        <Story />
      </ThemeInjector>
    ),
    // The language tool of the toolbar picks the labels of the Nova components
    (Story) => (
      <StoryLocaleRoot>
        <Story />
      </StoryLocaleRoot>
    ),
  ],
};

export default preview;
