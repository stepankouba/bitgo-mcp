import { bitgoGet } from '../bitgo';
import { getConfiguredWallets, getWalletId } from '../wallets';

const SATOSHI = 1e8;

interface Transfer {
  id: string;
  txid: string;
  value: number;
  feeString?: string;
  state: string;
  confirmations: number;
  height?: number;
  date: string;
}

interface TransfersResponse {
  transfers: Transfer[];
}

function formatTransfer(t: Transfer, walletName: string) {
  return {
    transferId: t.id,
    txHash: t.txid,
    wallet: walletName,
    direction: t.value >= 0 ? 'receive' : 'send',
    amount: Math.abs(t.value) / SATOSHI,
    fee: t.feeString != null ? parseInt(t.feeString, 10) / SATOSHI : undefined,
    state: t.state,
    confirmations: t.confirmations,
    blockHeight: t.height,
    date: t.date,
    unit: 'BTC',
  };
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
