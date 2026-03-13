import { bitgoGet } from '../bitgo';
import { getConfiguredWallets, getWalletId } from '../wallets';
import { Transfer, formatTransfer } from './formatTransfer';

interface TransfersResponse {
  transfers: Transfer[];
}

export async function getTransferStatus(params: {
  transferId?: string;
  txHash?: string;
  wallet?: string;
}) {
  const { transferId, txHash, wallet: walletName } = params;

  if (!transferId && !txHash) {
    throw new Error('Either transferId or txHash is required');
  }

  const targets = walletName
    ? [{ name: walletName.toUpperCase(), id: getWalletId(walletName) }]
    : getConfiguredWallets();

  for (const { name, id } of targets) {
    try {
      if (transferId) {
        const transfer = await bitgoGet<Transfer>(
          `/api/v2/btc/wallet/${id}/transfer/${transferId}`
        );
        if (transfer) return formatTransfer(transfer, name);
      } else if (txHash) {
        const result = await bitgoGet<TransfersResponse>(
          `/api/v2/btc/wallet/${id}/transfer?txHash=${txHash}&limit=1`
        );
        const transfer = result.transfers?.[0];
        if (transfer) return formatTransfer(transfer, name);
      }
    } catch {
      // Not found in this wallet — continue to next
    }
  }

  throw new Error('Transfer not found in any configured wallet');
}
