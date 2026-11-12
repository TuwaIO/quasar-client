// @ts-check
/**
 * @file TypeDoc plugin that turns the GitHub alerts of the package READMEs into plain quotes on the generated pages
 * (see `plainAlerts` of `readmeText.mjs`). The READMEs keep their alerts for GitHub and npm.
 */

import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

import { plainAlerts } from './readmeText.mjs';

/**
 * TypeDoc plugin entry point. Side effect: mutates the contents of every rendered Markdown page.
 *
 * @param {import('typedoc').Application} app - TypeDoc application instance.
 * @returns {void}
 */
export function load(app) {
  app.renderer.on(MarkdownPageEvent.END, (page) => {
    if (page.contents) {
      page.contents = plainAlerts(page.contents);
    }
  });
}
