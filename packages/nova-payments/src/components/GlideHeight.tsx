import { type ReactNode, useEffect, useRef } from 'react';

import { watchHeightGlide } from './heightGlide';

/**
 * The part of the checkout frame under its strip: on a narrow screen its height glides when a status screen gives way
 * to the next (`watchHeightGlide`), so the heading the buyer reads moves in one calm motion and never jumps. On a wide
 * screen the frame holds its height and this box only passes the layout on: both of its elements keep the column that
 * fills the frame, so the screen area still scrolls inside it.
 *
 * Side effects: those of `watchHeightGlide` while mounted.
 *
 * @param props - Whether a change of height glides now, and the content.
 * @returns The box.
 * @internal
 */
export function GlideHeight({ active, children }: { active: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const activeNow = useRef(active);
  useEffect(() => {
    activeNow.current = active;
  }, [active]);
  useEffect(() => {
    if (!box.current || !content.current || typeof window === 'undefined' || !window.matchMedia) return;
    const narrow = window.matchMedia('(max-width: 639.98px)');
    return watchHeightGlide({
      box: box.current,
      content: content.current,
      isNarrow: () => narrow.matches,
      isActive: () => activeNow.current,
    });
  }, []);
  return (
    // Its own height on a narrow screen too: a box that fills its column takes no height of its own, and none glides
    <div ref={box} className="novapay:flex novapay:flex-none novapay:flex-col novapay:sm:min-h-0 novapay:sm:flex-1">
      {/* Its own height on a narrow screen, whatever the box does; the column of the frame on a wide one */}
      <div
        ref={content}
        className="novapay:flex novapay:flex-none novapay:flex-col novapay:sm:min-h-0 novapay:sm:flex-1"
      >
        {children}
      </div>
    </div>
  );
}
