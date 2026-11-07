// @ts-check
/**
 * @file TypeDoc plugin that turns the generated MDX pages into Storybook docs pages.
 *
 * Storybook indexes every `src/**\/*.mdx` file as a docs page. This plugin gives each generated page an explicit
 * title with `<Meta title="…" />`, so the Packages section of the sidebar follows the layout of the other TUWA
 * documentation sites instead of the output folders, and rewrites the links between pages (relative `.mdx` paths)
 * to Storybook routes (`?path=/docs/<id>`), which Storybook's MDX renderer opens in the manager.
 *
 * Titles, derived from the output path:
 * - `index.mdx` → `Packages/Overview`;
 * - `<package>/index.mdx` → `Packages/<package>/Overview` (README and exports of the package);
 * - `<package>/<module>/index.mdx` → `Packages/<package>/<module>/Overview` (packages with several entry points);
 * - `<package>[/<module>]/<kind>/<Name>.mdx` → `Packages/<package>[/<module>]/<Kind>/<Name>`.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

// Storybook derives docs IDs from titles with `sanitize` from `storybook/internal/csf`: use the same function.
const require = createRequire(new URL('../package.json', import.meta.url));
const { sanitize } = await import(pathToFileURL(require.resolve('storybook/internal/csf')).href);

/** Sidebar labels of the folders TypeDoc writes reflections to. */
const KIND_LABELS = {
  classes: 'Classes',
  enumerations: 'Enumerations',
  functions: 'Functions',
  interfaces: 'Interfaces',
  namespaces: 'Namespaces',
  'type-aliases': 'Type Aliases',
  variables: 'Variables',
};

/** Matches the target of a Markdown link: `](target)`. */
const LINK_PATTERN = /\]\(([^)\s]+)\)/g;

/**
 * Returns the Storybook title of a generated page.
 *
 * @param {string} url - Output path of the page, relative to the output folder (for example
 * `nova-connect/hooks/functions/useNovaConnect.mdx`).
 * @returns {string} The title, for example `Packages/nova-connect/hooks/Functions/useNovaConnect`.
 * @throws {Error} When the page is in a folder this plugin does not know.
 */
export function getStorybookTitle(url) {
  const segments = url.replace(/\.mdx$/, '').split('/');
  const name = segments.pop();
  if (name === 'index') return ['Packages', ...segments, 'Overview'].join('/');
  const kind = /** @type {keyof typeof KIND_LABELS} */ (segments.pop());
  const label = KIND_LABELS[kind];
  if (!label) throw new Error(`storybookRoutes: unknown output folder "${kind}" of ${url}`);
  return ['Packages', ...segments, label, name].join('/');
}

/**
 * Returns the Storybook route of the docs page with a title.
 *
 * @param {string} title - Storybook title.
 * @returns {string} The route, for example `?path=/docs/packages-overview--docs`.
 */
export function getStorybookRoute(title) {
  return `?path=/docs/${sanitize(title)}--docs`;
}

/**
 * Rewrites the relative `.mdx` links of a page to Storybook routes. Other links (absolute URLs, `#anchors`) are kept.
 *
 * @param {string} contents - Generated MDX of the page.
 * @param {string} url - Output path of the page, relative to the output folder.
 * @returns {string} The MDX with rewritten links.
 */
export function rewriteLinks(contents, url) {
  return contents.replace(LINK_PATTERN, (match, target) => {
    const [targetPath, hash] = target.split('#');
    if (!targetPath.endsWith('.mdx') || /^[a-z]+:/i.test(targetPath)) return match;
    const targetUrl = path.posix.normalize(path.posix.join(path.posix.dirname(url), targetPath));
    return `](${getStorybookRoute(getStorybookTitle(targetUrl))}${hash ? `#${hash}` : ''})`;
  });
}

/**
 * TypeDoc plugin entry point. Side effect: mutates the contents of every rendered page.
 *
 * @param {import('typedoc').Application} app - TypeDoc application instance.
 * @returns {void}
 */
export function load(app) {
  /** @type {Map<string, string>} */
  const pagesById = new Map();

  app.renderer.on(MarkdownPageEvent.END, (page) => {
    if (!page.contents) return;
    const url = page.url.split(path.sep).join('/');
    const title = getStorybookTitle(url);
    const id = sanitize(title);
    const duplicate = pagesById.get(id);
    if (duplicate) throw new Error(`storybookRoutes: ${url} and ${duplicate} get the same Storybook ID "${id}"`);
    pagesById.set(id, url);

    page.contents = [
      "import { Meta } from '@storybook/addon-docs/blocks';",
      '',
      `<Meta title="${title}" />`,
      '',
      rewriteLinks(page.contents, url),
    ].join('\n');
  });
}
