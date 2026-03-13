import { bitgoGet } from '../bitgo';
import { getConfiguredWallets, getWalletId } from '../wallets';
import { Transfer, formatTransfer } from './formatTransfer';

interface TransfersResponse {
  transfers: Transfer[];
}

export async function listTransfers(params: {
  wallet?: string;
  state?: string;
  direction?: 'send' | 'receive';
  limit?: number;
}) {
  const { wallet: walletName, state, direction, limit = 25 } = params;
  const effectiveLimit = Math.min(limit, 100);

  const targets = walletName
    ? [{ name: walletName.toUpperCase(), id: getWalletId(walletName) }]
    : getConfiguredWallets();

  const allTransfers = await Promise.all(
    targets.map(async ({ name, id }) => {
      const qs = new URLSearchParams({ limit: String(effectiveLimit) });
      if (state) qs.set('state', state);
      if (direction) qs.set('type', direction);

      const result = await bitgoGet<TransfersResponse>(
        `/api/v2/btc/wallet/${id}/transfer?${qs}`
      );
      return (result.transfers ?? []).map((t) => formatTransfer(t, name));
    })
  );

  const flat = allTransfers.flat();
  flat.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { count: flat.length, transfers: flat };
}
