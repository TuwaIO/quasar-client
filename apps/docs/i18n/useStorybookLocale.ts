/**
 * @file The language in the preview iframe: one subscription to the channel of Storybook, shared by every story and
 * docs page that reads it.
 */

import { useSyncExternalStore } from 'react';
import { addons } from 'storybook/preview-api';

import {
  DEFAULT_LOCALE,
  getInitialLocale,
  normalizeLocale,
  REQUEST_LOCALE_EVENT,
  SET_LOCALE_EVENT,
  type StorybookLocale,
} from './locale';

let currentLocale: StorybookLocale = getInitialLocale();
let connected = false;
const listeners = new Set<() => void>();

/**
 * Sets `<html lang>` of the preview iframe, so screen readers read the components and the translated pages in the
 * selected language.
 *
 * @param locale - The selected language.
 */
export function applyDocumentLanguage(locale: StorybookLocale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

applyDocumentLanguage(currentLocale);

function handleLocale(value: unknown) {
  const next = normalizeLocale(value) ?? DEFAULT_LOCALE;
  if (next === currentLocale) return;
  currentLocale = next;
  applyDocumentLanguage(next);
  listeners.forEach((listener) => listener());
}

/** Listens for the language of the manager once, then asks the manager for it (it answers with `tuwa/set-locale`). */
function connect() {
  if (connected) return;
  try {
    const channel = addons.getChannel();
    channel.on(SET_LOCALE_EVENT, handleLocale);
    channel.emit(REQUEST_LOCALE_EVENT);
    connected = true;
  } catch {
    // The channel is not ready yet: the next subscriber retries
  }
}

function subscribe(listener: () => void) {
  connect();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentLocale;
}

function getServerSnapshot() {
  return DEFAULT_LOCALE;
}

/**
 * Returns the language selected in the toolbar and re-renders when it changes. Before the manager answers, it is the
 * language of {@link getInitialLocale} (the one saved in this tab or the language of the browser).
 *
 * @returns The selected language.
 */
export function useStorybookLocale(): StorybookLocale {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
