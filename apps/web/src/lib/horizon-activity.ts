/**
 * Minimal Horizon client for the activity history page.
 *
 * Only the operations the page renders are mapped: payments (and the other
 * balance-moving operation types Horizon reports alongside them) plus contract
 * invocations. Using `fetch` directly keeps the mapper pure and lets tests run
 * without a network or the Stellar SDK.
 */

/** The subset of a Horizon operation record this module reads. */
export interface HorizonOperationRecord {
  id: string;
  paging_token: string;
  created_at: string;
  transaction_hash: string;
  source_account: string;
  type: string;
  transaction_successful?: boolean;
  from?: string;
  to?: string;
  funder?: string;
  account?: string;
  into?: string;
  starting_balance?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  function?: string;
  address?: string;
}

interface HorizonOperationsResponse {
  _embedded?: { records?: HorizonOperationRecord[] };
  _links?: { next?: { href?: string } };
}

export type ActivityKind = 'payment' | 'contract';

/** One row in the activity history. */
export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  /** Raw Horizon operation type, e.g. `payment` or `invoke_host_function`. */
  type: string;
  /** ISO-8601 creation time reported by Horizon. */
  createdAt: string;
  transactionHash: string;
  sourceAccount: string;
  successful: boolean;
  title: string;
  /** Short human-readable context; contains full addresses for the page to truncate. */
  detail: string;
  /** Amount with its asset code when Horizon reports one, e.g. `10.0000000 XLM`. */
  amount?: string;
  /** The other account involved in a payment, if any. */
  counterparty?: string;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  /** Cursor for the next `loadMore`, or `null` when Horizon has no older records. */
  nextCursor: string | null;
}

export interface FetchActivityPageOptions {
  horizonUrl: string;
  address: string;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
  /** Injectable `fetch` for tests; defaults to the global implementation. */
  fetchImpl?: typeof fetch;
  /** Maximum Horizon requests one page may make while filling filtered results. */
  maxScans?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_SCANS = 5;

function trimBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function assetLabel(record: HorizonOperationRecord): string | undefined {
  if (record.asset_type === 'native') return 'XLM';
  return record.asset_code;
}

function amountLabel(record: HorizonOperationRecord): string | undefined {
  const amount = record.amount ?? record.starting_balance;
  if (!amount) return undefined;
  const asset = assetLabel(record);
  return asset ? `${amount} ${asset}` : amount;
}

function describeContractFunction(fn: string | undefined): string {
  if (!fn) return 'Contract invocation';
  const stripped = fn.replace(/^HostFunctionType/, '');
  const spaced = stripped.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return `Contract ${spaced || 'invocation'}`;
}

/**
 * Maps one Horizon operation to an activity row, or `null` for operation types
 * the history does not show (trustlines, offers, account options, and so on).
 */
export function mapHorizonOperation(
  record: HorizonOperationRecord,
  account: string,
): ActivityEntry | null {
  const shared = {
    id: record.id,
    type: record.type,
    createdAt: record.created_at,
    transactionHash: record.transaction_hash,
    sourceAccount: record.source_account,
    successful: record.transaction_successful ?? true,
  };

  if (record.type === 'invoke_host_function') {
    const detail = record.address
      ? `${describeContractFunction(record.function)} on ${record.address}`
      : describeContractFunction(record.function);
    return { ...shared, kind: 'contract', title: 'Contract invocation', detail };
  }

  if (
    record.type === 'payment' ||
    record.type === 'path_payment_strict_receive' ||
    record.type === 'path_payment_strict_send'
  ) {
    const incoming = record.to === account;
    const outgoing = record.from === account;
    const path = record.type.startsWith('path_payment');
    const title = outgoing
      ? incoming
        ? 'Payment to self'
        : path
          ? 'Path payment sent'
          : 'Payment sent'
      : incoming
        ? path
          ? 'Path payment received'
          : 'Payment received'
        : 'Payment';
    return {
      ...shared,
      kind: 'payment',
      title,
      detail: outgoing
        ? `To ${record.to ?? 'unknown account'}`
        : `From ${record.from ?? 'unknown account'}`,
      amount: amountLabel(record),
      counterparty: outgoing ? record.to : record.from,
    };
  }

  if (record.type === 'create_account') {
    const created = record.account === account;
    return {
      ...shared,
      kind: 'payment',
      title: created ? 'Account created' : 'Account funded',
      detail: created
        ? `Funded by ${record.funder ?? 'unknown account'}`
        : `Created ${record.account ?? 'an account'}`,
      amount: amountLabel(record),
      counterparty: created ? record.funder : record.account,
    };
  }

  if (record.type === 'account_merge') {
    const mergedInto = record.into === account;
    return {
      ...shared,
      kind: 'payment',
      title: mergedInto ? 'Account merged in' : 'Account merged',
      detail: mergedInto
        ? `From ${record.account ?? 'unknown account'}`
        : `Into ${record.into ?? 'unknown account'}`,
      counterparty: mergedInto ? record.account : record.into,
    };
  }

  return null;
}

/** Returns the configured explorer URL for a confirmed transaction. */
export function explorerTransactionUrl(expertUrl: string, transactionHash: string): string {
  return `${trimBaseUrl(expertUrl)}/tx/${transactionHash}`;
}

/**
 * Formats a Horizon timestamp in UTC with a fixed layout, so the server and
 * client renders produce the same string regardless of local time zone.
 */
export function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

/**
 * Fetches one page of activity, newest first.
 *
 * Horizon caps a response before the page's client-side type filter, so a
 * single request can contain no activity at all. The loop keeps scanning older
 * pages until it has something to show or Horizon runs out, bounded by
 * `maxScans` so a quiet account cannot trigger an unbounded burst.
 */
export async function fetchActivityPage(options: FetchActivityPageOptions): Promise<ActivityPage> {
  const {
    horizonUrl,
    address,
    cursor,
    limit = DEFAULT_LIMIT,
    signal,
    fetchImpl = fetch,
    maxScans = MAX_SCANS,
  } = options;

  const base = `${trimBaseUrl(horizonUrl)}/accounts/${encodeURIComponent(address)}/operations`;
  const entries: ActivityEntry[] = [];
  let nextCursor: string | null = cursor ?? null;
  let lastToken = nextCursor;
  let reachedEnd = false;

  for (let scan = 0; scan < maxScans; scan += 1) {
    const url = new URL(base);
    url.searchParams.set('order', 'desc');
    url.searchParams.set('limit', String(limit));
    if (nextCursor) url.searchParams.set('cursor', nextCursor);

    const response = await fetchImpl(url.toString(), {
      signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('This account has no Horizon history yet.');
      }
      throw new Error(
        `Horizon request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`,
      );
    }

    const body = (await response.json()) as HorizonOperationsResponse;
    const records = body._embedded?.records ?? [];
    if (records.length === 0) {
      reachedEnd = true;
      break;
    }

    lastToken = records[records.length - 1]?.paging_token ?? lastToken;
    nextCursor = lastToken;

    for (const record of records) {
      const entry = mapHorizonOperation(record, address);
      if (entry) entries.push(entry);
    }

    if (records.length < limit) {
      reachedEnd = true;
      break;
    }
    if (entries.length > 0) break;
  }

  return {
    entries,
    nextCursor: reachedEnd ? null : lastToken,
  };
}
