import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error A plain module of the docs build, without types of its own
import { plainAlerts, readmeForPage, stripBadges } from './readmeText.mjs';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const ALERT_MARK = /\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/;
const BADGE_HOST = /img\.shields\.io|badge\.socket\.dev/;

describe('the text of a package README on the docs pages', () => {
  // Storybook printed `[!IMPORTANT]` as text before the notice of a package page: only GitHub and npm draw the mark
  it('turns an alert of GitHub into a plain quote', () => {
    const readme = '# Package\n\n> [!IMPORTANT]\n> Docs only.\n\n> [!NOTE]\n> In development.\n\nText\n';
    expect(plainAlerts(readme)).toBe('# Package\n\n> Docs only.\n\n> In development.\n\nText\n');
  });

  it('leaves a quote, a link and a mark inside a sentence as they are', () => {
    const readme = '> A quote.\n\n[A link](https://tuwa.io)\n\n[!NOTE] in a sentence\n';
    expect(plainAlerts(readme)).toBe(readme);
  });

  // A badge is an image from another host: a reader of the docs site would give that host an IP address
  it('drops the badges, which a reader of the site would load from the badge host', () => {
    const badges =
      '[![NPM Version](https://img.shields.io/npm/v/@tuwaio/x.svg)](https://www.npmjs.com/package/@tuwaio/x)\n[![License](https://img.shields.io/npm/l/@tuwaio/x.svg)](https://github.com/TuwaIO/x/LICENSE)\n\n';
    expect(stripBadges(`# Package\n\n${badges}Text\n`)).toBe('# Package\n\nText\n');
    expect(readmeForPage(`# Package\n\n${badges}> [!NOTE]\n> A note.\n`)).toBe('# Package\n\n> A note.\n');
  });

  it('is so on every package page: the generated ones and the README shown as it is', () => {
    for (const page of ['../src/packages/nova-payments/index.mdx', '../src/packages/quasar-sdk/index.mdx']) {
      expect(read(page), page).not.toMatch(ALERT_MARK);
      expect(read(page), page).not.toMatch(BADGE_HOST);
    }
    const config = read('../../../typedoc.json');
    expect(config).toContain('./apps/docs/typedoc/stripBadges.mjs');
    expect(config).toContain('./apps/docs/typedoc/githubAlerts.mjs');
    // The README of the module is imported raw: the page passes it through the same functions
    expect(read('../src/PaymentsSdk.mdx')).toContain('<Markdown>{readmeForPage(Readme)}</Markdown>');
    const shown = readmeForPage(read('../../../packages/payments-sdk/README.md'));
    expect(shown).not.toMatch(ALERT_MARK);
    expect(shown).not.toMatch(BADGE_HOST);
  });
});
