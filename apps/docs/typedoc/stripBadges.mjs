// @ts-check
/**
 * @file TypeDoc plugin that removes the badges of the package READMEs from the generated pages (see `stripBadges` of
 * `readmeText.mjs`). The READMEs keep their badges; only the generated pages drop them.
 */

import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

import { stripBadges } from './readmeText.mjs';

/**
 * TypeDoc plugin entry point. Side effect: mutates the contents of every rendered Markdown page.
 *
 * @param {import('typedoc').Application} app - TypeDoc application instance.
 * @returns {void}
 */
export function load(app) {
  app.renderer.on(MarkdownPageEvent.END, (page) => {
    if (page.contents) {
      page.contents = stripBadges(page.contents);
    }
  });
}
