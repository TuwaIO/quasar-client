/**
 * @file The icons of the checkout, in the TUWA pixel style. All of them follow the icon set of the closest
 * `NovaIconsProvider` of `@tuwaio/nova-core` (the pixel icons of `@tuwaio/nova-icons` without one), so an app that gave
 * Nova another set gets it in the checkout as well:
 *
 * - the icons the Nova components draw too are in every set, and `NovaSetIcon` draws them;
 * - the icons only the checkout draws (`NOVA_EXTRA_OUTLINE_ICONS` of `@tuwaio/nova-core` 0.15.1 and newer) are optional
 *   in a set. The checkout takes one from the set when the set has it, as the Heroicons set does, and draws its own pixel
 *   icon otherwise: with a set of an app that has none, and with an older `@tuwaio/nova-core`, whose sets know none.
 */

import { NovaSetIcon, useNovaIcons } from '@tuwaio/nova-core';
import {
  ArrowDownTrayIcon as PixelArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon as PixelArrowPathRoundedSquareIcon,
  ArrowUturnLeftIcon as PixelArrowUturnLeftIcon,
  DevicePhoneMobileIcon as PixelDevicePhoneMobileIcon,
  FingerPrintIcon as PixelFingerPrintIcon,
  LockClosedIcon as PixelLockClosedIcon,
  MagnifyingGlassIcon as PixelMagnifyingGlassIcon,
  NoSymbolIcon as PixelNoSymbolIcon,
  QrCodeIcon as PixelQrCodeIcon,
} from '@tuwaio/nova-icons/24/outline';
import type { ComponentType, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;
type IconComponent = ComponentType<IconProps>;

/**
 * The outline icons of the icon set of the closest `NovaIconsProvider`, by a plain name: the names of the icons only the
 * checkout draws are optional in a set, and the types of `@tuwaio/nova-core` 0.15.0 do not know them. An icon the set
 * does not have is `undefined`, and the checkout draws its pixel icon then.
 *
 * @returns The outline icons of the set.
 */
function useSetOutline(): Partial<Record<string, IconComponent>> {
  return useNovaIcons().outline;
}

/** The arrow of a part that opens and of a list: the solid icon of the Nova set, drawn for small sizes. @internal */
export function ChevronDownIcon(props: IconProps) {
  return <NovaSetIcon solid="ChevronDownIcon" {...props} />;
}

/** The language of the checkout: the solid icon of the Nova set, drawn for small sizes. @internal */
export function GlobeAltIcon(props: IconProps) {
  return <NovaSetIcon solid="GlobeAltIcon" {...props} />;
}

/** A deadline and a wait. @internal */
export function ClockIcon(props: IconProps) {
  return <NovaSetIcon outline="ClockIcon" {...props} />;
}

/** A receipt. @internal */
export function DocumentTextIcon(props: IconProps) {
  return <NovaSetIcon outline="DocumentTextIcon" {...props} />;
}

/** Something to mind before going on. @internal */
export function ExclamationTriangleIcon(props: IconProps) {
  return <NovaSetIcon outline="ExclamationTriangleIcon" {...props} />;
}

/** A note. @internal */
export function InformationCircleIcon(props: IconProps) {
  return <NovaSetIcon outline="InformationCircleIcon" {...props} />;
}

/** A wallet that is not connected yet. @internal */
export function WalletOutlineIcon(props: IconProps) {
  return <NovaSetIcon outline="WalletIcon" {...props} />;
}

/** The download of a receipt. @internal */
export function ArrowDownTrayIcon(props: IconProps) {
  const outline = useSetOutline();
  const Icon = outline.ArrowDownTrayIcon ?? PixelArrowDownTrayIcon;
  return <Icon {...props} />;
}

/** An invoice the seller replaced with another. @internal */
export function ArrowPathRoundedSquareIcon(props: IconProps) {
  const outline = useSetOutline();
  const Icon = outline.ArrowPathRoundedSquareIcon ?? PixelArrowPathRoundedSquareIcon;
  return <Icon {...props} />;
}

/** A refunded invoice. @internal */
export function ArrowUturnLeftIcon(props: IconProps) {
  const outline = useSetOutline();
  const Icon = outline.ArrowUturnLeftIcon ?? PixelArrowUturnLeftIcon;
  return <Icon {...props} />;
}

/** Paying on a phone. @internal */
export function DevicePhoneMobileIcon(props: IconProps) {
  const outline = useSetOutline();
  const Icon = outline.DevicePhoneMobileIcon ?? PixelDevicePhoneMobileIcon;
  return <Icon {...props} />;
}

/** A passkey or a fingerprint a smart wallet may ask for. @internal */
export function FingerPrintIcon(props: IconProps) {
  const outline = useSetOutline();
  const Icon = outline.FingerPrintIcon ?? PixelFingerPrintIcon;
  return <Icon {...props} />;
}

/** "Secured by Quasar". @internal */
export function LockClosedIcon(props: IconProps) {
  const outline = useSetOutline();
  const Icon = outline.LockClosedIcon ?? PixelLockClosedIcon;
  return <Icon {...props} />;
}

/** A payment the seller is checking. @internal */
export function MagnifyingGlassIcon(props: IconProps) {
  const outline = useSetOutline();
  const Icon = outline.MagnifyingGlassIcon ?? PixelMagnifyingGlassIcon;
  return <Icon {...props} />;
}

/** A wallet that did not pass the check. @internal */
export function NoSymbolIcon(props: IconProps) {
  const outline = useSetOutline();
  const Icon = outline.NoSymbolIcon ?? PixelNoSymbolIcon;
  return <Icon {...props} />;
}

/** Paying with a QR code. @internal */
export function QrCodeIcon(props: IconProps) {
  const outline = useSetOutline();
  const Icon = outline.QrCodeIcon ?? PixelQrCodeIcon;
  return <Icon {...props} />;
}
