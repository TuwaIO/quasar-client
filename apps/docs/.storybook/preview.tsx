import '../src/styles/app.css';

import { DocsContainer } from '@storybook/addon-docs/blocks';
import type { Preview } from '@storybook/react-vite';
import { NovaIconsProvider } from '@tuwaio/nova-core';
import { heroicons } from '@tuwaio/nova-core/heroicons';
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
  // The deep shade of the TUWA orange: white text on the chosen item is 5.7:1
  colorPrimary: '#b93b0a',
  colorSecondary: '#b93b0a',
  appBg: '#f2f1ee',
  appContentBg: '#faf9f7',
  appPreviewBg: '#faf9f7',
  appBorderColor: '#d6d5d1',
  appBorderRadius: 0,
  fontBase: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontCode: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  textColor: '#101014',
  textInverseColor: '#faf9f7',
  textMutedColor: '#636366',
  barTextColor: '#636366',
  barSelectedColor: '#b93b0a',
  barHoverColor: '#f05a14',
  barBg: '#f2f1ee',
  inputBg: '#faf9f7',
  inputBorder: '#bdbcb9',
  inputTextColor: '#101014',
  inputBorderRadius: 0,
});

const tuwaDarkTheme = create({
  base: 'dark',
  brandTitle: 'TUWA Payments',
  brandUrl: 'https://www.tuwa.io/',
  brandImage: LOGO_DARK,
  brandTarget: '_self',
  // The cyan of the dark logo; the chosen item takes a deep cyan under white text, 5.4:1 (Storybook darkens it 18% more)
  colorPrimary: '#3ed2ec',
  colorSecondary: '#0e7490',
  appBg: '#101014',
  appContentBg: '#121316',
  appPreviewBg: '#121316',
  appBorderColor: '#2b2c30',
  appBorderRadius: 0,
  fontBase: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontCode: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  textColor: '#f2f1ee',
  textInverseColor: '#101014',
  textMutedColor: '#9d9c9a',
  barTextColor: '#9d9c9a',
  barSelectedColor: '#3ed2ec',
  barHoverColor: '#8ef5ff',
  barBg: '#101014',
  inputBg: '#17181b',
  inputBorder: '#3a3b3f',
  inputTextColor: '#f2f1ee',
  inputBorderRadius: 0,
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
  // The icons of Nova: pixel by default, or the Heroicons set and the classic look of what Nova draws
  globalTypes: {
    icons: {
      description: 'The icons and the look of Nova',
      toolbar: {
        title: 'Icons',
        icon: 'grid',
        items: [
          { value: 'pixel', title: 'Pixel (nova-icons)' },
          { value: 'heroicons', title: 'Classic (Heroicons)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { icons: 'pixel' },
  decorators: [
    (Story, context) =>
      context.globals.icons === 'heroicons' ? (
        <NovaIconsProvider icons={heroicons}>
          <Story />
        </NovaIconsProvider>
      ) : (
        <Story />
      ),
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
