import { delay } from '@tuwaio/orbit-core';
import { useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import { takeOverOpens } from '../utils/checkout';
import { formatTokenAmount, shortAddress } from '../utils/format';
import { networkName } from '../utils/methods';
import { addressOfWallet, formatPeriod, isSameWallet } from '../utils/outcome';
import { OPEN_REQUEST_MS, settlesWithin } from '../utils/settlesWithin';
import { PaymentWalletError, type PaymentWalletErrorKind, walletErrorKind } from '../utils/walletErrors';
import { capsLabel } from './capsLabel';
import {
  ChainLink,
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
    state,
    store,
    labels,
    locale,
    wallet,
    adapterFor,
    connectFamily,
    setAutoPayOff,
    setAutoPay,
    revokeSent: sent,
    setRevokeSent,
  } = useCheckoutContext();
  const [step, setStep] = useState<'idle' | 'wallet' | 'network'>('idle');
  const [problem, setProblem] = useState<PaymentWalletErrorKind | 'notYet' | 'notAsked' | null>(null);
  // Another wallet: what the last one refused is not about this one
  const address = wallet?.address;
  const [shownAddress, setShownAddress] = useState(address);
  if (shownAddress !== address) {
    setShownAddress(address);
    setProblem(null);
  }
  const offer = checkout?.autoCharge;
  // Only where the screen that gives a new permission can open: an outcome keeps its own screen
  const replaceable = offer?.status === 'active' && Boolean(offer.replacement) && takeOverOpens(state.phase);
  if (!checkout || offer?.status !== 'active' || !offer.permission || !offer.revocation) return null;

  const { permission, revocation } = offer;
  const merchant = checkout.merchant.name;
  const chainId = permission.chainId ?? '';
  const network = networkName(chainId);
  const payer = addressOfWallet(permission.payer ?? '');
  // Without its method the row is left out: another token's decimals and symbol would name a wrong amount
  const method = checkout.methods.find((item) => item.id === permission.methodId);
  const adapter = adapterFor('eip155');
  const payerConnected = Boolean(wallet && isSameWallet(wallet.address, payer));

  /** Asks Quasar, which asks the chain; the screen closes when the permission has ended. */
  const check = async () => {
    setStep('network');
    let answered = false;
    for (let i = 0; i < CHECKS; i++) {
      const revoked = await store.getState().permissionRevoked();
      if (revoked === true) return setAutoPayOff('done');
      answered ||= revoked === false;
      if (i < CHECKS - 1) await delay(undefined, CHECK_EVERY_MS);
    }
    // Quasar never answered: nobody asked the network, so it cannot be said what the network shows
    setProblem(answered ? 'notYet' : 'notAsked');
  };

  const turnOff = async () => {
    if (!wallet) return;
    setProblem(null);
    let wentOut = false;
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
        const settled = await settlesWithin(
          adapter.revokePermission({
            revocation,
            chainId,
            account: wallet.address,
            onSent: () => {
              wentOut = true;
              setRevokeSent(true);
              // Nothing waits in the wallet any more, only the network: the button says so
              setStep('network');
            },
          }),
          OPEN_REQUEST_MS,
        );
        // A wallet that lost the request never answers: nothing went out, so the chain cannot show anything
        if (!settled && !wentOut) return setProblem('alreadyPending');
      }
      await check();
    } catch (error) {
      if (wentOut) {
        // A transaction went out and its fee was spent, so "nothing was sent" would be untrue. A reverted one left nothing to
        // wait for: the wallet may be asked again. Otherwise the chain has the answer
        if (error instanceof PaymentWalletError && error.kind === 'failed') setRevokeSent(false);
        await check().catch(() => setProblem('notYet'));
      } else {
        setProblem(walletErrorKind(error));
      }
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
          : problem === 'wrongNetwork' || problem === 'switchFailed'
            ? formatLabel(labels.pay.switchFailed, values)
            : problem === 'notAuthorized'
              ? formatLabel(labels.pay.notAuthorized, values)
              : problem === 'alreadyPending'
                ? formatLabel(labels.walletPrompt.stillWaiting, values)
                : problem === 'failed'
                  ? formatLabel(labels.pay.walletFailed, values)
                  : problem
                    ? labels.error.generic
                    : null;
  const decimals = method ? Number(method.decimals) : null;

  return (
    <>
      <ScreenContent title={labels.autoPayOff.title} subtitle={formatLabel(labels.autoPayOff.subtitle, { merchant })}>
        <DetailsCard>
          <DetailRow name={labels.autoPayOff.wallet}>
            <span className="novapay:inline-flex novapay:items-center novapay:gap-1">
              <ChainLink hash={payer} chainId={chainId} /> · {network}
            </span>
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
              ? capsLabel(labels.autoPayOff.inWallet, values)
              : step === 'network'
                ? labels.autoPayOff.waiting
                : sent
                  ? labels.autoPayOff.checkAgain
                  : capsLabel(labels.autoPayOff.confirm, values)}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => void connectFamily('eip155')}>{labels.autoPayOff.connect}</PrimaryButton>
        )}
        {/* Its wallet cannot pay, or it expired: this wallet may take over, with its own permission */}
        {!payerConnected && wallet && replaceable && (
          <SecondaryButton
            onClick={() => {
              setAutoPayOff(null);
              setAutoPay(true);
            }}
          >
            {labels.autoPayOff.useThisWallet}
          </SecondaryButton>
        )}
        <SecondaryButton onClick={() => setAutoPayOff(null)}>{labels.autoPayOff.keep}</SecondaryButton>
      </ScreenFooter>
    </>
  );
}
