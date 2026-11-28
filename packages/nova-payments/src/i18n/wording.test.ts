import { describe, expect, it } from 'vitest';

import { loadLabels } from '.';

/** Every text of a language's labels, with its path. */
const textsOf = (labels: object, path: string[] = []): [string, string][] =>
  Object.entries(labels).flatMap(([key, value]): [string, string][] => {
    if (typeof value === 'string') return [[[...path, key].join('.'), value]];
    return value && typeof value === 'object' ? textsOf(value as object, [...path, key]) : [];
  });

// Quasar records the transactions of payments, and the money goes from the buyer to the merchant: a text that says
// Quasar gets, takes or is handed the payment, or the refund, reads as if Quasar received the money. The page sends
// Quasar the transaction of a payment or a refund, and says so
describe('what the checkout says of Quasar and the money', () => {
  it('never says that Quasar receives, takes or is handed the payment or the refund', async () => {
    const wrong = textsOf(await loadLabels('en')).filter(([, text]) =>
      [
        /(hand|give|pass)(s|es|ing|ed)?( (the|your|this))? (payment|refund)( over)? to Quasar/i,
        /Quasar (did not |does not |never )?(receive[sd]?|takes?|took|gets?|got)( this| the| your)? (payment|refund)/i,
        /Quasar (has not |hasn't |did not |does not )?(takes?|took|taken) (its|the|this|your) transaction/i,
        /\bhand (it|them) over\b/i,
      ].some((pattern) => pattern.test(text)),
    );
    expect(wrong).toEqual([]);
  });

  it('in Chinese never calls money released, kept in custody, held or frozen', async () => {
    const wrong = textsOf(await loadLabels('zh-CN')).filter(([, text]) => /释放|托管|保管|冻结/.test(text));
    expect(wrong).toEqual([]);
  });

  it('in Ukrainian says that a token charges its fee, never that it holds it back', async () => {
    const wrong = textsOf(await loadLabels('uk')).filter(([, text]) => /утрим/i.test(text));
    expect(wrong).toEqual([]);
  });

  // «Передаємо» Quasar reads as handing over the money: the page sends Quasar the transaction
  it('in Ukrainian never hands anything over to Quasar', async () => {
    const wrong = textsOf(await loadLabels('uk')).filter(
      ([, text]) => text.includes('Quasar') && /Перед(аємо|ати|айте|ає|аю)/i.test(text),
    );
    expect(wrong).toEqual([]);
  });
});
