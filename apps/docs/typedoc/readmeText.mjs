// @ts-check
/**
 * @file What the docs pages change in the text of a package README. No imports: the page of a README that is shown as
 * it is (`PaymentsSdk.mdx`) uses these functions in the browser, and the TypeDoc plugins (`stripBadges.mjs`,
 * `githubAlerts.mjs`) on the generated pages. The READMEs themselves stay as GitHub and npm show them.
 */

/** A line holding only linked badge images from a badge host. */
const BADGE_LINE_PATTERN =
  /^(?:\[!\[[^\]]*\]\(https:\/\/(?:img\.shields\.io|badge\.socket\.dev|socket\.dev)\/[^)]*\)\]\([^)]*\)\s*)+\n(?:\s*\n)?/gm;

/** The first line of an alert of GitHub Markdown: the mark alone in a quote, at any depth of quoting. */
const ALERT_MARK_LINE = /^[ \t]*(?:>[ \t]*)+\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\r?\n/gm;

/**
 * Removes the lines of badge images from Markdown, with the blank line after them.
 *
 * A README starts with badge images (`img.shields.io`). GitHub and npm show them through their own image proxies, but
 * on the docs site every reader's browser would load them from the badge host, which then gets the reader's IP address
 * (Cookie and Privacy policies).
 *
 * @param {string} contents - Markdown of a page or a README.
 * @returns {string} The Markdown without badge lines.
 */
export function stripBadges(contents) {
  return contents.replace(BADGE_LINE_PATTERN, '');
}

/**
 * Removes the mark lines of GitHub alerts from Markdown; the text of an alert stays a quote.
 *
 * A README marks a notice the way GitHub and npm draw as a colored box: a quote whose first line is `[!IMPORTANT]`,
 * `[!NOTE]`, `[!TIP]`, `[!WARNING]` or `[!CAUTION]`. Storybook does not know the mark and printed it as text before the
 * notice. Without that line the notice is a quote, which the docs pages draw with a line at its side.
 *
 * @param {string} contents - Markdown of a page or a README.
 * @returns {string} The Markdown without the mark lines.
 */
export function plainAlerts(contents) {
  return contents.replace(ALERT_MARK_LINE, '');
}

/**
 * A package README as a docs page shows it: without its badges and with its alerts as plain quotes.
 *
 * @param {string} contents - Markdown of a README.
 * @returns {string} The Markdown for the page.
 */
export function readmeForPage(contents) {
  return plainAlerts(stripBadges(contents));
}
