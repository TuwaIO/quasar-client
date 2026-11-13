import { MorphText } from '@tuwaio/nova-core';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';

import { formatLabelParts } from '../i18n';

/** Props of {@link CapsLabel}. @internal */
export interface CapsLabelProps {
  /** A label, with `{name}` placeholders when it is filled in, for example `Back to {merchant}`. */
  label: string;
  /** The value of each placeholder; none for a label without placeholders. */
  values?: Record<string, string | number>;
}

/** A part of a label: its text, and whether the checkout filled it in. */
type Part = [text: string, filled: boolean];

/** What the checkout fills in keeps its own letters inside a part in capitals. */
const OWN_LETTERS = 'novapay:normal-case';

/**
 * The places of a label that are always there: words, a name, words, as a button with one name has them. A place that is
 * empty in one label and filled in the next is there from the start, so what comes into it morphs in instead of jumping in.
 */
const PLACES = 3;

const NO_VALUES: Record<string, string | number> = {};

/**
 * The text of a place without the spaces at its ends, and those spaces. The spaces between two places are plain text of
 * the label, outside the elements of the places: the name of a button is put together from the texts of its elements,
 * and a space at the end of an element is dropped by some of those who compute it ("Confirm inMetaMask").
 *
 * @param text - The text of a place.
 * @returns The spaces before, the text, the spaces after.
 */
function withSpacesApart(text: string): [before: string, text: string, after: string] {
  const [, before = '', core = '', after = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];
  return [before, core, after];
}

/**
 * The width a label would take on one line, with the letters of the element it is in: a copy that is measured and removed
 * before the browser paints, so it is never seen, read or found.
 *
 * @param host - The element the label is drawn in.
 * @param parts - The parts of the label.
 * @returns The width, in pixels.
 */
function widthOnOneLine(host: HTMLElement, parts: Part[]): number {
  const probe = host.ownerDocument.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none';
  for (const [text, filled] of parts) {
    const part = host.ownerDocument.createElement('span');
    if (filled) part.style.textTransform = 'none';
    part.textContent = text;
    probe.append(part);
  }
  host.append(probe);
  const { width } = probe.getBoundingClientRect();
  probe.remove();
  return width;
}

/**
 * The width the label may take in the element around it: the inside of that element without what stands beside the label
 * (the loader of a busy button) and the gaps of the row.
 *
 * @param host - The element the label is drawn in.
 * @param row - The element around it.
 * @returns The width, in pixels.
 */
function roomIn(host: HTMLElement, row: HTMLElement): number {
  const style = getComputedStyle(row);
  const others = [...row.children].filter((child) => child !== host);
  const taken = others.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0);
  const gaps = (Number.parseFloat(style.columnGap) || 0) * others.length;
  return row.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) - taken - gaps;
}

/**
 * The label of a part that is shown in capitals (a button of a screen footer, the label of a group): the words of the
 * checkout take the capitals of the part around it, and what the checkout fills in keeps its own letters. The name of a
 * seller, a wallet, a network or a token is theirs and is never changed, as in Nova; an amount and a number read the same
 * either way. The text of the element is the label as it is written, so a screen reader and a copy get no capitals.
 *
 * The label is one element: one item of a button that lays its content out in a row. When the label changes, each of its
 * places morphs on its own (`MorphText` of `@tuwaio/nova-core`): the words into the new words, a name into the new name;
 * a name that stays keeps its letters, and a place that empties or fills morphs out or in. A plain label and a filled-in
 * one are the same element, so one morphs into the other. The spaces between the places are plain text between their
 * elements.
 *
 * A label too long for one line is drawn as plain text, which wraps, and changes with a short fade: a place cannot break
 * across lines while it morphs, and the lines would jump. It is measured before the browser paints, and again when the
 * element around it changes its size.
 *
 * @param props - See {@link CapsLabelProps}.
 * @returns The label.
 * @internal
 */
export function CapsLabel({ label, values = NO_VALUES }: CapsLabelProps) {
  const host = useRef<HTMLSpanElement>(null);
  const [wraps, setWraps] = useState(false);
  const [places, setPlaces] = useState(PLACES);

  const filledIn = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { own: String(value) }]));
  const parts = formatLabelParts(label, filledIn).map((part): Part =>
    typeof part === 'string' ? [part, false] : [part.own, true],
  );
  // The label as one value: the effect below runs when the label changes, not on every render of the screen
  const signature = JSON.stringify(parts);

  useLayoutEffect(() => {
    const element = host.current;
    const row = element?.parentElement;
    if (!element || !row) return;
    const shown = JSON.parse(signature) as Part[];
    const update = () => {
      setWraps(widthOnOneLine(element, shown) > roomIn(element, row) + 0.5);
      setPlaces((count) => Math.max(count, shown.length));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(row);
    return () => observer.disconnect();
  }, [signature]);

  if (wraps) {
    return (
      <span ref={host} className="novapay:min-w-0">
        <span key={signature} className="novapay-label-fade">
          {parts.map(([text, filled], index) =>
            filled ? (
              <span key={index} className={OWN_LETTERS}>
                {text}
              </span>
            ) : (
              text
            ),
          )}
        </span>
      </span>
    );
  }
  return (
    <span ref={host} className="novapay:min-w-0 novapay:whitespace-nowrap">
      {Array.from({ length: Math.max(places, parts.length) }, (_, index) => {
        const [text, filled] = parts[index] ?? ['', false];
        const [before, core, after] = withSpacesApart(text);
        return (
          <Fragment key={index}>
            {before}
            <MorphText className={filled ? OWN_LETTERS : undefined}>{core}</MorphText>
            {after}
          </Fragment>
        );
      })}
    </span>
  );
}
