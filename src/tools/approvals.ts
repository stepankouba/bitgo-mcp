import { bitgoGet } from '../bitgo';
import { getConfiguredWallets, getWalletId } from '../wallets';

const SATOSHI = 1e8;

interface Resolver {
  user: string;
  date?: string;
  resolutionType: string;      // 'pending', 'approved', 'rejected'
  resolutionAction?: string;   // 'approve', 'reject'
}

interface PendingApproval {
  id: string;
  coin?: string;
  wallet?: string;
  enterprise?: string;
  creator: string;
  state: string;
  createDate: string;
  approvalsRequired?: number;
  resolvers?: Resolver[];
  userIds?: string[];
  info?: {
    type?: string;
    transactionRequest?: {
      requestedAmount?: number;
      address?: string;
      memo?: string;
    };
  };
}

interface ApprovalsResponse {
  pendingApprovals: PendingApproval[];
}

interface EnterpriseUser {
  id: string;
  username: string;
}

interface EnterpriseUsersResponse {
  adminUsers?: EnterpriseUser[];
  nonAdminUsers?: EnterpriseUser[];
}

// Cache enterprise user maps by enterprise ID to avoid repeated lookups
const enterpriseUserCache = new Map<string, Map<string, string>>();

async function getEnterpriseUserMap(enterpriseId: string): Promise<Map<string, string>> {
  if (enterpriseUserCache.has(enterpriseId)) {
    return enterpriseUserCache.get(enterpriseId)!;
  }
  try {
    const result = await bitgoGet<EnterpriseUsersResponse>(
      `/api/v2/enterprise/${enterpriseId}/user`
    );
    const map = new Map<string, string>();
    for (const u of result.adminUsers ?? []) map.set(u.id, u.username);
    for (const u of result.nonAdminUsers ?? []) map.set(u.id, u.username);
    enterpriseUserCache.set(enterpriseId, map);
    return map;
  } catch {
    return new Map();
  }
}

async function getWalletEnterprise(walletId: string): Promise<string | undefined> {
  try {
    const w = await bitgoGet<{ enterprise?: string }>(`/api/v2/btc/wallet/${walletId}`);
    return w.enterprise;
  } catch {
    return undefined;
  }
}

async function getApprovalDetail(approvalId: string): Promise<PendingApproval> {
  try {
    return await bitgoGet<PendingApproval>(`/api/v2/btc/pendingapprovals/${approvalId}`);
  } catch {
    return {} as PendingApproval;
  }
}

function resolverApproved(r: Resolver): boolean {
  // BitGo uses resolutionAction='approve' with resolutionType='pending' for in-progress approvals
  return r.resolutionType === 'approved' || r.resolutionAction === 'approve';
}

function resolverRejected(r: Resolver): boolean {
  return r.resolutionType === 'rejected' || r.resolutionAction === 'reject';
}

function formatApproval(
  approval: PendingApproval,
  detail: PendingApproval,
  walletName: string,
  walletId: string,
  userMap: Map<string, string>
) {
  const txRequest = approval.info?.transactionRequest;
  const resolvers = detail.resolvers ?? approval.resolvers ?? [];
  const userIds = detail.userIds ?? approval.userIds ?? [];
  const approvalsRequired = detail.approvalsRequired ?? approval.approvalsRequired ?? 0;

  const approvedBy = resolvers.filter(resolverApproved);
  const rejectedBy = resolvers.filter(resolverRejected);
  const resolvedUserIds = new Set(resolvers.map((r) => r.user));
  const stillPending = userIds.filter((uid) => !resolvedUserIds.has(uid));

  const resolve = (uid: string) => userMap.get(uid) ?? uid;

  return {
    approvalId: approval.id,
    wallet: walletName,
    walletId,
    creator: resolve(approval.creator),
    type: approval.info?.type ?? 'unknown',
    state: approval.state,
    createdDate: approval.createDate,
    amount: txRequest?.requestedAmount != null
      ? txRequest.requestedAmount / SATOSHI
      : undefined,
    destinationAddress: txRequest?.address,
    memo: txRequest?.memo,
    unit: 'BTC',
    approvalsRequired,
    approvalsReceived: approvedBy.length,
    approvalsStillNeeded: Math.max(0, approvalsRequired - approvedBy.length),
    approvedBy: approvedBy.map((r) => ({
      user: resolve(r.user),
      date: r.date,
    })),
    rejectedBy: rejectedBy.map((r) => ({
      user: resolve(r.user),
      date: r.date,
    })),
    awaitingApprovalFrom: stillPending.map(resolve),
  };
}

export async function getPendingApprovals(walletName?: string) {
  const targets = walletName
    ? [{ name: walletName.toUpperCase(), id: getWalletId(walletName) }]
    : getConfiguredWallets();

  const allApprovals = await Promise.all(
    targets.map(async ({ name, id }) => {
      const [result, enterpriseId] = await Promise.all([
        bitgoGet<ApprovalsResponse>(`/api/v2/pendingapprovals?walletId=${id}&coin=btc`),
        getWalletEnterprise(id),
      ]);

      const userMap = enterpriseId
        ? await getEnterpriseUserMap(enterpriseId)
        : new Map<string, string>();

      const approvals = result.pendingApprovals ?? [];
      const details = await Promise.all(approvals.map((a) => getApprovalDetail(a.id)));

      return approvals.map((a, i) => formatApproval(a, details[i], name, id, userMap));
    })
  );

  const flat = allApprovals.flat();
  return { count: flat.length, approvals: flat };
}
