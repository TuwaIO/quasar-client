/**
 * @file The icons of the checkout, in the TUWA pixel style. Those the Nova components draw too come from the icon set of
 * the closest `NovaIconsProvider` of `@tuwaio/nova-core` (the pixel icons of `@tuwaio/nova-icons` without one), so an app
 * that gave Nova another set gets it in the checkout as well; the icons only the checkout draws are the pixel ones.
 */

import { NovaSetIcon } from '@tuwaio/nova-core';
import type { SVGProps } from 'react';

export {
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  ArrowUturnLeftIcon,
  DevicePhoneMobileIcon,
  FingerPrintIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  QrCodeIcon,
} from '@tuwaio/nova-icons/24/outline';

type IconProps = SVGProps<SVGSVGElement>;

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
