const SATOSHI = 1e8;

export interface Transfer {
  id: string;
  txid: string;
  value: number;
  feeString?: string;
  state: string;
  confirmations: number;
  height?: number;
  date: string;
}

export function formatTransfer(t: Transfer, walletName: string) {
  const value = Math.abs(t.value) / SATOSHI;
  const fee = t.feeString != null ? parseInt(t.feeString, 10) / SATOSHI : undefined;
  const netAmount = fee != null ? value - fee : undefined;

  return {
    transferId: t.id,
    txHash: t.txid,
    wallet: walletName,
    direction: t.value >= 0 ? 'receive' : 'send',
    amount: value,
    fee,
    netAmount,
    state: t.state,
    confirmations: t.confirmations,
    blockHeight: t.height,
    date: t.date,
    unit: 'BTC',
  };
}
