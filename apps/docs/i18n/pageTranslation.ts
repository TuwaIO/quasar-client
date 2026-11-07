/**
 * @file Tells the docs container whether the page on screen is shown in the selected language, so it hides the
 * "English only" note on translated pages.
 */

import { createContext } from 'react';

/**
 * Called by `LocalizedPage` with `true` while it shows a translation and with `false` when it unmounts. The default
 * does nothing (a page rendered outside the docs container).
 */
export const PageTranslationContext = createContext<(translated: boolean) => void>(() => {});
