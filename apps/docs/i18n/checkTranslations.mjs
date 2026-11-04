#!/usr/bin/env node
// Checks the Storybook translations against their English pages: `i18n/<language>/<Page>.mdx` translates
// `src/<Page>.mdx`. Every translated page exists in every language (one folder per language here) and keeps the fenced
// code blocks of its English page unchanged and in the same order (diagrams and examples are never translated) and
// the same links. The rules of `tuwa-docs-i18n-check` of the TUWA documentation sites, without heading ids, which
// Storybook does not take from the text. Reads files only; exits with 1 on a problem. Run by `pnpm docs:gen`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const i18nDir = dirname(fileURLToPath(import.meta.url));
const englishDir = join(i18nDir, '../src');
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** The fenced code blocks of a page, in order, and the text outside them. */
function splitFences(source) {
  const blocks = [];
  const prose = [];
  let block = null;
  let fence = '';
  for (const line of source.split('\n')) {
    if (block) {
      block.push(line);
      if (line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, '') === '') {
        blocks.push(block.join('\n'));
        block = null;
      }
      continue;
    }
    const open = FENCE_RE.exec(line);
    if (open) {
      fence = open[1];
      block = [line];
    } else {
      prose.push(line);
    }
  }
  if (block) blocks.push(block.join('\n'));
  return { blocks, prose: prose.join('\n') };
}

/** The link and image targets outside code: `[text](url)`, `href="url"` and `src="url"`, sorted. */
function links(prose) {
  const text = prose.replace(/`[^`\n]*`/g, '');
  const targets = [];
  for (const match of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|\b(?:href|src)=["']([^"']+)["']/g)) {
    targets.push(match[1] ?? match[2]);
  }
  return targets.sort();
}

/** What does not match between an English page and its translation. */
function compare(englishSource, translatedSource) {
  const issues = [];
  const english = splitFences(englishSource);
  const translated = splitFences(translatedSource);
  if (english.blocks.length !== translated.blocks.length) {
    issues.push(`has ${translated.blocks.length} code blocks, the English page ${english.blocks.length}`);
  } else {
    english.blocks.forEach((block, index) => {
      if (block !== translated.blocks[index]) issues.push(`code block ${index + 1} differs from the English one`);
    });
  }
  const englishLinks = links(english.prose);
  const translatedLinks = links(translated.prose);
  const missing = englishLinks.filter((link) => !translatedLinks.includes(link));
  const extra = translatedLinks.filter((link) => !englishLinks.includes(link));
  if (missing.length || extra.length || englishLinks.length !== translatedLinks.length) {
    issues.push(
      `links differ from the English page (missing: ${missing.join(', ') || 'none'}; not in English: ${extra.join(', ') || 'none'})`,
    );
  }
  return issues;
}

const languages = readdirSync(i18nDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const pages = [
  ...new Set(
    languages.flatMap((language) => readdirSync(join(i18nDir, language)).filter((file) => extname(file) === '.mdx')),
  ),
].sort();
const problems = [];

for (const page of pages) {
  const englishFile = join(englishDir, page);
  for (const language of languages) {
    const translatedFile = join(i18nDir, language, page);
    const shown = relative(process.cwd(), translatedFile);
    if (!existsSync(translatedFile)) {
      problems.push(`${shown}: is missing: every translated page exists in every language`);
    } else if (!existsSync(englishFile)) {
      problems.push(`${shown}: has no English page ${relative(process.cwd(), englishFile)}`);
    } else {
      const issues = compare(readFileSync(englishFile, 'utf8'), readFileSync(translatedFile, 'utf8'));
      for (const issue of issues) problems.push(`${shown}: ${issue}`);
    }
  }
}

for (const problem of problems) console.error(problem);
if (problems.length > 0) {
  console.error(`Translations: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`Translations: ${pages.length * languages.length} translated page(s) match their English pages`);
