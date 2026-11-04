import { useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import { formatTokenAmount, shortAddress } from '../utils/format';
import { networkName } from '../utils/methods';
import { addressOfWallet, formatPeriod, isSameWallet } from '../utils/outcome';
import { type PaymentWalletErrorKind, walletErrorKind } from '../utils/walletErrors';
import {
  DetailRow,
  DetailsCard,
  PrimaryButton,
  ScreenContent,
  ScreenError,
  ScreenFooter,
  SecondaryButton,
} from './ScreenParts';

/** How many times Quasar is asked after the network included the transaction, and how far apart: RPC nodes lag. */
const CHECKS = 5;
const CHECK_EVERY_MS = 2000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Turns off the automatic payments of a subscription: what it means, then the wallet that allowed them sends the
 * transaction that revokes the permission and pays its network fee, and Quasar asks the chain. Only that wallet can do
 * it, so another wallet is asked to connect it first.
 *
 * Side effects: a wallet prompt and a transaction; `POST permission/revoked` of the checkout.
 *
 * @returns The screen, or nothing while automatic payments are not on.
 */
export function AutoPayOffScreen() {
  const {
    checkout,
    store,
    labels,
    locale,
    wallet,
    adapterFor,
    connectFamily,
    setAutoPayOff,
    revokeSent: sent,
    setRevokeSent,
  } = useCheckoutContext();
  const [step, setStep] = useState<'idle' | 'wallet' | 'network'>('idle');
  const [problem, setProblem] = useState<PaymentWalletErrorKind | 'notYet' | 'notAsked' | null>(null);
  const offer = checkout?.autoCharge;
  if (!checkout || offer?.status !== 'active' || !offer.permission || !offer.revocation) return null;

  const { permission, revocation } = offer;
  const merchant = checkout.merchant.name;
  const chainId = permission.chainId ?? '';
  const network = networkName(chainId);
  const payer = addressOfWallet(permission.payer ?? '');
  const method = checkout.methods.find((item) => item.id === permission.methodId) ?? checkout.methods[0];
  const adapter = adapterFor('eip155');
  const payerConnected = Boolean(wallet && isSameWallet(wallet.address, payer));

  /** Asks Quasar, which asks the chain; the screen closes when the permission has ended. */
  const check = async () => {
    setStep('network');
    for (let i = 0; i < CHECKS; i++) {
      if ((await store.getState().permissionRevoked()) === true) return setAutoPayOff('done');
      if (i < CHECKS - 1) await pause(CHECK_EVERY_MS);
    }
    setProblem('notYet');
  };

  const turnOff = async () => {
    if (!wallet) return;
    setProblem(null);
    try {
      if (!sent) {
        // Revoked already, from another tab or the wallet's own page: a second transaction reverts at the buyer's cost
        setStep('network');
        const revoked = await store.getState().permissionRevoked();
        if (revoked === true) return setAutoPayOff('done');
        // Quasar could not be asked: nothing goes to the wallet on a guess
        if (revoked === null) return setProblem('notAsked');
        if (!adapter?.revokePermission) return setProblem('unsupported');
        setStep('wallet');
        await adapter.revokePermission({
          revocation,
          chainId,
          account: wallet.address,
          onSent: () => setRevokeSent(true),
        });
      }
      await check();
    } catch (error) {
      setProblem(walletErrorKind(error));
    } finally {
      setStep('idle');
    }
  };

  const values = { wallet: wallet?.name ?? '', network };
  const problemText =
    problem === 'notYet'
      ? labels.autoPayOff.notYet
      : problem === 'declined'
        ? formatLabel(labels.pay.declined, values)
        : problem === 'unsupported'
          ? formatLabel(labels.autoPayOff.unsupported, values)
          : problem
            ? labels.error.generic
            : null;
  const decimals = method ? Number(method.decimals) : null;

  return (
    <>
      <ScreenContent title={labels.autoPayOff.title} subtitle={formatLabel(labels.autoPayOff.subtitle, { merchant })}>
        <DetailsCard>
          <DetailRow name={labels.autoPayOff.wallet}>
            {shortAddress(payer)} · {network}
          </DetailRow>
          {permission.periodAmount && decimals !== null && method && (
            <DetailRow name={labels.autoPayOff.allowed}>
              {formatLabel(labels.autoPay.limit, {
                amount: `${formatTokenAmount(permission.periodAmount, decimals, locale)} ${method.symbol}`,
              })}{' '}
              {formatLabel(labels.autoPay.every, { period: formatPeriod(permission.periodSeconds ?? 0, locale) })}
            </DetailRow>
          )}
        </DetailsCard>
        <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
          {payerConnected
            ? formatLabel(labels.autoPayOff.fee, { network })
            : formatLabel(labels.autoPayOff.otherWallet, { wallet: shortAddress(payer) })}
        </p>
        {problemText && <ScreenError>{problemText}</ScreenError>}
      </ScreenContent>
      <ScreenFooter>
        {payerConnected ? (
          <PrimaryButton busy={step !== 'idle'} onClick={() => void turnOff()}>
            {step === 'wallet'
              ? formatLabel(labels.autoPayOff.inWallet, values)
              : step === 'network'
                ? labels.autoPayOff.waiting
                : sent
                  ? labels.autoPayOff.checkAgain
                  : formatLabel(labels.autoPayOff.confirm, values)}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => void connectFamily('eip155')}>{labels.autoPayOff.connect}</PrimaryButton>
        )}
        <SecondaryButton onClick={() => setAutoPayOff(null)}>{labels.autoPayOff.keep}</SecondaryButton>
      </ScreenFooter>
    </>
  );
}
