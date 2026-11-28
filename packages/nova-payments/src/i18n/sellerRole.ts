import { formatLabel } from './formatLabel';
import { type CheckoutLocale, checkoutLocaleOf } from './locales';

/**
 * What the checkout says of who sells and what Quasar is, in each of its languages; `{seller}` is the seller as the
 * invoice names them. It is no label: neither the `labels` of `NovaPaymentsProvider` or of the checkout nor
 * `customization.labels.transform` changes it, so a page that embeds the checkout can neither take it away nor make it
 * say otherwise. A language the package does not have gets the English sentence.
 */
export const SELLER_ROLE: Readonly<Record<CheckoutLocale, string>> = {
  en: '{seller} is the seller. Quasar is the payment software: it never holds your funds and is not a party to this purchase.',
  uk: '{seller} — продавець. Quasar — платіжне програмне забезпечення: він ніколи не зберігає ваші кошти й не є стороною цієї покупки.',
  'zh-CN': '{seller} 是卖方。Quasar 是付款软件：它从不持有您的资金，也不是此次购买的一方。',
  es: '{seller} es el vendedor. Quasar es el software de pago: nunca guarda tus fondos y no es parte de esta compra.',
  it: '{seller} è il venditore. Quasar è il software di pagamento: non detiene mai i tuoi fondi e non è parte di questo acquisto.',
  de: '{seller} ist der Verkäufer. Quasar ist die Zahlungssoftware: Quasar verwahrt Ihre Mittel nie und ist nicht Partei dieses Kaufvertrags.',
};

/**
 * The sentence of the checkout on who sells and what Quasar is.
 *
 * @param locale - The language of the checkout; one the package does not have gets English.
 * @param seller - The seller as the invoice names them.
 * @returns The sentence, with the seller in it.
 */
export function sellerRoleText(locale: string | null | undefined, seller: string): string {
  return formatLabel(SELLER_ROLE[checkoutLocaleOf(locale) ?? 'en'], { seller });
}
