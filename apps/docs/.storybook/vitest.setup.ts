import { MotionGlobalConfig } from 'framer-motion';

import { LOCALE_STORAGE_KEY } from '../i18n/locale';

// The story tests check each story with axe once it has rendered: without animations the dialogs and toasts are at
// their final opacity then, not halfway through fading in (which axe would read as low contrast)
MotionGlobalConfig.skipAnimations = true;

// The stories are tested in English: their play functions name buttons and headings in English, and the checkout
// follows the language of the toolbar, which a first visit takes from the browser
window.sessionStorage.setItem(LOCALE_STORAGE_KEY, 'en');
