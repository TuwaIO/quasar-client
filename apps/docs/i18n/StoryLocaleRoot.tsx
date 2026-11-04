import { NovaTransactionsLabelsProvider } from '@tuwaio/nova-transactions/providers';
import type { ReactNode } from 'react';

import { novaTransactionsLabels } from './novaLabels';
import { useStorybookLocale } from './useStorybookLocale';

/**
 * Wraps every story (a global decorator of `.storybook/preview.tsx`) in the language selected in the toolbar: it gives
 * the Nova Transactions components their labels, and `NovaConnectProvider` of `src/utils/storybook-providers.tsx`
 * takes the Nova Connect labels the same way. `lang` tells screen readers the language of the labels, also inside the
 * English docs pages; `display: contents` (`.tuwa-storybook-locale` in `src/styles/app.css`) keeps the wrapper out of
 * the layout.
 *
 * @param props - The props.
 * @param props.children - The story.
 * @returns The story in the selected language.
 */
export function StoryLocaleRoot({ children }: { children: ReactNode }) {
  const locale = useStorybookLocale();

  return (
    <div lang={locale} className="tuwa-storybook-locale">
      <NovaTransactionsLabelsProvider labels={novaTransactionsLabels[locale]}>
        {children}
      </NovaTransactionsLabelsProvider>
    </div>
  );
}
