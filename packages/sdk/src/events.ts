import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
type T = string | readonly (xdr.ScVal | string)[];
type V = xdr.ScVal | unknown;
export type StreamEvent =
  | {
      type: 'StreamCreated';
      id: bigint;
      sender: string;
      recipient: string;
      amount: bigint;
      label: string;
      reference: string;
    }
  | {
      type: 'StreamWithdrawn';
      id: bigint;
      recipient: string;
      amount: bigint;
      fee: bigint;
    }
  | { type: 'StreamCancelled'; id: bigint; sender: string; refunded: bigint };
export type SplitEvent =
  | { type: 'SplitCreated'; id: bigint; creator: string; total_shares: number }
  | {
      type: 'SplitDistributed';
      id: bigint;
      from: string;
      token: string;
      amount: bigint;
    };
export type EscrowEvent =
  | { type: 'EscrowCreated'; id: bigint; payer: string; amount: bigint }
  | { type: 'EscrowFunded'; id: bigint; amount: bigint }
  | {
      type: 'EscrowReleased';
      id: bigint;
      caller: string;
      payee: string;
      amount: bigint;
    }
  | {
      type: 'EscrowRefunded';
      id: bigint;
      caller: string;
      payer: string;
      amount: bigint;
    }
  | { type: 'EscrowCancelled'; id: bigint; payer: string };
export type ContractEvent = StreamEvent | SplitEvent | EscrowEvent;
const sym = (v: xdr.ScVal | string): string | null => {
  if (typeof v === 'string') return v;
  try {
    return v.switch() === xdr.ScValType.scvSymbol() ? v.sym().toString() : null;
  } catch {
    return null;
  }
};
function dec<E extends ContractEvent>(
  t: T,
  v: V,
  ns: string,
  vs: Record<string, (d: Record<string, unknown>) => E | null>,
): E | null {
  let p: string[];
  try {
    p =
      typeof t === 'string'
        ? t.split(/[.:/]/).filter(Boolean)
        : t.map(sym).filter((x): x is string => x !== null);
  } catch {
    return null;
  }
  if (p[0] !== ns || !p[1]) return null;
  let r: unknown;
  try {
    r = v instanceof xdr.ScVal ? scValToNative(v) : v;
  } catch {
    return null;
  }
  const d = r instanceof Map ? Object.fromEntries(r) : r;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  if (Array.isArray(t) && t[2]) {
    try {
      (d as Record<string, unknown>).id = scValToNative(t[2] as xdr.ScVal);
    } catch {
      return null;
    }
  }
  try {
    return vs[p[1]]?.(d as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}
const bi = (v: unknown): bigint | null =>
  typeof v === 'bigint'
    ? v
    : typeof v === 'number' && Number.isSafeInteger(v)
      ? BigInt(v)
      : typeof v === 'string' && /^-?\d+$/.test(v)
        ? BigInt(v)
        : null;
const n = (d: Record<string, unknown>, k: string) => bi(d[k]);
const s = (d: Record<string, unknown>, k: string): string | null => {
  const v = d[k];
  if (typeof v === 'string') return v;
  try {
    return v instanceof Address ? v.toString() : null;
  } catch {
    return null;
  }
};
const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);
export const decodeStreamEvent = (t: T, v: V): StreamEvent | null =>
  dec<StreamEvent>(t, v, 'stream', {
    created: (d) => {
      const id = n(d, 'id'),
        sender = s(d, 'sender'),
        recipient = s(d, 'recipient'),
        amount = n(d, 'amount');
      return id !== null &&
        sender !== null &&
        recipient !== null &&
        amount !== null &&
        typeof d.label === 'string' &&
        typeof d.reference === 'string'
        ? {
            type: 'StreamCreated',
            id,
            sender,
            recipient,
            amount,
            label: d.label,
            reference: d.reference,
          }
        : null;
    },
    withdrawn: (d) => {
      const id = n(d, 'id'),
        recipient = s(d, 'recipient'),
        amount = n(d, 'amount'),
        fee = n(d, 'fee');
      return id !== null && recipient !== null && amount !== null && fee !== null
        ? { type: 'StreamWithdrawn', id, recipient, amount, fee }
        : null;
    },
    cancelled: (d) => {
      const id = n(d, 'id'),
        sender = s(d, 'sender'),
        refunded = n(d, 'refunded');
      return id !== null && sender !== null && refunded !== null
        ? { type: 'StreamCancelled', id, sender, refunded }
        : null;
    },
  });
export const decodeSplitEvent = (t: T, v: V): SplitEvent | null =>
  dec<SplitEvent>(t, v, 'splits', {
    created: (d) => {
      const id = n(d, 'id'),
        creator = s(d, 'creator'),
        total_shares = num(d.total_shares);
      return id !== null && creator !== null && total_shares !== null
        ? { type: 'SplitCreated', id, creator, total_shares }
        : null;
    },
    distrib: (d) => {
      const id = n(d, 'id'),
        from = s(d, 'from'),
        token = s(d, 'token'),
        amount = n(d, 'amount');
      return id !== null && from !== null && token !== null && amount !== null
        ? { type: 'SplitDistributed', id, from, token, amount }
        : null;
    },
  });
export const decodeEscrowEvent = (t: T, v: V): EscrowEvent | null =>
  dec<EscrowEvent>(t, v, 'escrow', {
    created: (d) => {
      const id = n(d, 'id'),
        payer = s(d, 'payer'),
        amount = n(d, 'amount');
      return id !== null && payer !== null && amount !== null
        ? { type: 'EscrowCreated', id, payer, amount }
        : null;
    },
    funded: (d) => {
      const id = n(d, 'id'),
        amount = n(d, 'amount');
      return id !== null && amount !== null ? { type: 'EscrowFunded', id, amount } : null;
    },
    released: (d) => {
      const id = n(d, 'id'),
        caller = s(d, 'caller'),
        payee = s(d, 'payee'),
        amount = n(d, 'amount');
      return id !== null && caller !== null && payee !== null && amount !== null
        ? { type: 'EscrowReleased', id, caller, payee, amount }
        : null;
    },
    refunded: (d) => {
      const id = n(d, 'id'),
        caller = s(d, 'caller'),
        payer = s(d, 'payer'),
        amount = n(d, 'amount');
      return id !== null && caller !== null && payer !== null && amount !== null
        ? { type: 'EscrowRefunded', id, caller, payer, amount }
        : null;
    },
    cancelled: (d) => {
      const id = n(d, 'id'),
        payer = s(d, 'payer');
      return id !== null && payer !== null ? { type: 'EscrowCancelled', id, payer } : null;
    },
  });
/** Decode an event emitted by any protocol contract. */
export const decodeEvent = (t: T, v: V): ContractEvent | null =>
  decodeStreamEvent(t, v) ?? decodeSplitEvent(t, v) ?? decodeEscrowEvent(t, v);
