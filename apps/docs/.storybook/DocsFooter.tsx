import { GitHubIcon, NpmIcon } from '@tuwaio/nova-icons/brands';
import React from 'react';

import { type FooterPolicySlug, policyLanguageOf, storybookLabels } from '../i18n/labels';
import type { StorybookLocale } from '../i18n/locale';

// The policies in force, in the order of `footerPolicies` of @tuwaio/docs-ui (packages/docs-ui/src/policies.ts in
// TuwaIO/docs); the Storybook does not depend on docs-ui, which needs Next.js. Add a policy here (and its title to
// `i18n/labels.ts`) when it is published there.
const POLICIES: readonly FooterPolicySlug[] = ['terms', 'privacy', 'cookie', 'security', 'dpa'];

const POLICIES_INDEX_URL = 'https://docs.tuwa.io/policies';

// The default footer links of the documentation sites (`baseFooterLinks` of @tuwaio/docs-ui), with their pixel marks
const LINKS = [
  { title: 'NPM', href: 'https://npmjs.com/org/tuwaio', className: 'tuwa-docs-footer__social--npm', Icon: NpmIcon },
  { title: 'GitHub', href: 'https://github.com/TuwaIO', className: '', Icon: GitHubIcon },
];

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * The footer of every docs page, like the footer of the TUWA documentation sites: the TUWA logo and the npm and GitHub
 * organizations with their pixel marks (`@tuwaio/nova-icons/brands`), the TUWA description and license, the policies on tuwa.io, the list of all policies on the docs hub
 * and the copyright line, in the language selected in the toolbar. The policies open in Ukrainian for Ukrainian
 * (`?lang=uk`) and in English otherwise, the languages they exist in. `sb-unstyled` keeps the typography of the docs
 * pages off it; the styles are in `src/styles/app.css` (`.tuwa-docs-footer`).
 *
 * @param props - The props.
 * @param props.locale - The language selected in the toolbar.
 */
export function DocsFooter({ locale }: { locale: StorybookLocale }) {
  const labels = storybookLabels[locale].footer;
  const policyQuery = policyLanguageOf(locale) === 'en' ? '' : `?lang=${policyLanguageOf(locale)}`;

  return (
    <footer className="sb-unstyled tuwa-docs-footer" lang={locale}>
      <div className="tuwa-docs-footer__row">
        <a href="https://tuwa.io" {...external} aria-label="TUWA" className="tuwa-docs-footer__logo">
          <img
            src="https://tuwa.io/brand/logo_v2.svg"
            alt="TUWA"
            height={40}
            className="tuwa-docs-footer__logo-light"
          />
          <img
            src="https://tuwa.io/brand/logo_glow.svg"
            alt="TUWA"
            height={40}
            className="tuwa-docs-footer__logo-dark"
          />
        </a>
        <nav aria-label={labels.linksAriaLabel} className="tuwa-docs-footer__links">
          {LINKS.map((link) => (
            <a
              key={link.title}
              href={link.href}
              {...external}
              className={`tuwa-docs-footer__link tuwa-docs-footer__social ${link.className}`}
            >
              <link.Icon width={16} height={16} aria-hidden="true" />
              <span>{link.title}</span>
            </a>
          ))}
        </nav>
      </div>

      <div className="tuwa-docs-footer__row tuwa-docs-footer__divided">
        <div className="tuwa-docs-footer__about">
          <p className="tuwa-docs-footer__description">{labels.description}</p>
          <p className="tuwa-docs-footer__license">{labels.license}</p>
        </div>
        <nav aria-label={labels.policiesAriaLabel} className="tuwa-docs-footer__links tuwa-docs-footer__policies">
          {POLICIES.map((slug) => (
            <a
              key={slug}
              href={`https://tuwa.io/${slug}${policyQuery}`}
              {...external}
              className="tuwa-docs-footer__link"
            >
              {labels.policyTitles[slug]}
            </a>
          ))}
          <a href={POLICIES_INDEX_URL} {...external} className="tuwa-docs-footer__link tuwa-docs-footer__link--strong">
            {labels.allPolicies}
          </a>
        </nav>
      </div>

      <div className="tuwa-docs-footer__copyright tuwa-docs-footer__divided">
        © 2025 - {new Date().getFullYear()} TUWA. {labels.copyright}
      </div>
    </footer>
  );
}
