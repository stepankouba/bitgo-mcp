import { bitgoGet } from '../bitgo';
import { getConfiguredWallets, getWalletId } from '../wallets';

const SATOSHI = 1e8;

interface WalletResponse {
  id: string;
  label: string;
  balances: {
    confirmed: number;
    unconfirmed: number;
    spendable: number;
  };
  confirmedBalance: number;
  spendableBalances: { btc: number };
  spendableBalance: number;
}

export async function getWalletBalances(walletName?: string) {
  const targets = walletName
    ? [{ name: walletName.toUpperCase(), id: getWalletId(walletName) }]
    : getConfiguredWallets();

  const results = await Promise.all(
    targets.map(async ({ name, id }) => {
      const w = await bitgoGet<WalletResponse>(`/api/v2/btc/wallet/${id}`);
      return {
        wallet: name,
        walletId: id,
        label: w.label,
        confirmedBalance: (w.balances?.confirmed ?? w.confirmedBalance ?? 0) / SATOSHI,
        spendableBalance: (w.balances?.spendable ?? w.spendableBalance ?? 0) / SATOSHI,
        unit: 'BTC',
      };
    })
  );

  return results;
}
