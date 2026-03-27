const WALLET_NAMES = [
  'LW0', 'LW1', 'LIW1', 'LCW1', 'LCEW1', 'LCW2', 'LCW3_1',
  'LW0_V1', 'LW1_V1', 'LIW1_V1', 'LCW1_V1', 'LCEW1_V1',
] as const;

export function getWalletId(name: string): string {
  const key = name.toUpperCase();
  const id = process.env[`WALLET_${key}`];
  if (!id) {
    throw new Error(
      `Wallet "${name}" is not configured. Set the WALLET_${key} environment variable.`
    );
  }
  return id;
}

export function getConfiguredWallets(): Array<{ name: string; id: string }> {
  const result: Array<{ name: string; id: string }> = [];
  for (const name of WALLET_NAMES) {
    const id = process.env[`WALLET_${name}`];
    if (id) result.push({ name, id });
  }
  return result;
}
