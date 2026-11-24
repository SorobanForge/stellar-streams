import { describe, expect, it, vi } from 'vitest';
import {
  explorerTransactionUrl,
  fetchActivityPage,
  formatActivityTime,
  mapHorizonOperation,
  type HorizonOperationRecord,
} from './horizon-activity';

const ACCOUNT = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAc3LM2T2NY2424';
const OTHER = 'GC2B262OCPB4IA7CBZ77GLL7CQK7747754S727772656372657424242';
const HASH = 'abc123';

function operation(overrides: Partial<HorizonOperationRecord> = {}): HorizonOperationRecord {
  return {
    id: '1',
    paging_token: 'token-1',
    created_at: '2026-11-23T12:34:56Z',
    transaction_hash: HASH,
    source_account: ACCOUNT,
    type: 'payment',
    transaction_successful: true,
    from: OTHER,
    to: ACCOUNT,
    amount: '10.0000000',
    asset_type: 'native',
    ...overrides,
  };
}

function horizonResponse(records: HorizonOperationRecord[], ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? 'OK' : 'Not Found',
    json: async () => ({ _embedded: { records } }),
  } as unknown as Response;
}

describe('mapHorizonOperation', () => {
  it('maps an incoming payment with its asset amount', () => {
    const entry = mapHorizonOperation(operation(), ACCOUNT);

    expect(entry).toMatchObject({
      kind: 'payment',
      title: 'Payment received',
      amount: '10.0000000 XLM',
      counterparty: OTHER,
      transactionHash: HASH,
    });
    expect(entry!.detail).toContain(OTHER);
  });

  it('maps an outgoing payment and a self payment', () => {
    const outgoing = mapHorizonOperation(operation({ from: ACCOUNT, to: OTHER }), ACCOUNT);
    expect(outgoing!.title).toBe('Payment sent');
    expect(outgoing!.detail).toContain(OTHER);

    const self = mapHorizonOperation(operation({ from: ACCOUNT, to: ACCOUNT }), ACCOUNT);
    expect(self!.title).toBe('Payment to self');
  });

  it('labels issued assets by code', () => {
    const entry = mapHorizonOperation(
      operation({ asset_type: 'credit_alphanum4', asset_code: 'USDC', amount: '2.5000000' }),
      ACCOUNT,
    );

    expect(entry!.amount).toBe('2.5000000 USDC');
  });

  it('maps account creation and contract invocations', () => {
    const created = mapHorizonOperation(
      operation({
        type: 'create_account',
        account: ACCOUNT,
        funder: OTHER,
        starting_balance: '50.0000000',
        amount: undefined,
      }),
      ACCOUNT,
    );
    expect(created!.title).toBe('Account created');
    expect(created!.amount).toBe('50.0000000 XLM');

    const contract = mapHorizonOperation(
      operation({
        type: 'invoke_host_function',
        function: 'HostFunctionTypeInvokeContract',
        address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        from: undefined,
        to: undefined,
        amount: undefined,
      }),
      ACCOUNT,
    );
    expect(contract!.kind).toBe('contract');
    expect(contract!.title).toBe('Contract invocation');
    expect(contract!.detail).toContain('invoke contract');
  });

  it('ignores operation types the history does not show', () => {
    expect(mapHorizonOperation(operation({ type: 'set_options' }), ACCOUNT)).toBeNull();
    expect(mapHorizonOperation(operation({ type: 'manage_sell_offer' }), ACCOUNT)).toBeNull();
  });
});

describe('presentation helpers', () => {
  it('builds explorer transaction links and tolerates a trailing slash', () => {
    expect(explorerTransactionUrl('https://stellar.expert/explorer/testnet/', HASH)).toBe(
      `https://stellar.expert/explorer/testnet/tx/${HASH}`,
    );
  });

  it('formats timestamps in UTC regardless of the local zone', () => {
    expect(formatActivityTime('2026-11-23T12:34:56Z')).toBe('2026-11-23 12:34 UTC');
    expect(formatActivityTime('not-a-date')).toBe('not-a-date');
  });
});

describe('fetchActivityPage', () => {
  it('requests newest-first and returns a cursor when the page is full', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      horizonResponse([
        operation({ id: '1', paging_token: 'token-1' }),
        operation({ id: '2', paging_token: 'token-2', from: ACCOUNT, to: OTHER }),
      ]),
    );

    const page = await fetchActivityPage({
      horizonUrl: 'https://horizon-testnet.stellar.org/',
      address: ACCOUNT,
      limit: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const requested = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(requested.pathname).toBe(`/accounts/${ACCOUNT}/operations`);
    expect(requested.searchParams.get('order')).toBe('desc');
    expect(requested.searchParams.get('limit')).toBe('2');
    expect(page.entries.map((entry) => entry.id)).toEqual(['1', '2']);
    expect(page.nextCursor).toBe('token-2');
  });

  it('scans past pages that contain no matching operations', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        horizonResponse([
          operation({ id: 'a', type: 'set_options', paging_token: 'token-a' }),
          operation({ id: 'b', type: 'manage_sell_offer', paging_token: 'token-b' }),
        ]),
      )
      .mockResolvedValueOnce(horizonResponse([operation({ id: 'c', paging_token: 'token-c' })]));

    const page = await fetchActivityPage({
      horizonUrl: 'https://horizon-testnet.stellar.org',
      address: ACCOUNT,
      limit: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = new URL(fetchImpl.mock.calls[1]![0] as string);
    expect(second.searchParams.get('cursor')).toBe('token-b');
    expect(page.entries.map((entry) => entry.id)).toEqual(['c']);
  });

  it('returns no cursor when Horizon runs out of records', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => horizonResponse([operation()]));

    const page = await fetchActivityPage({
      horizonUrl: 'https://horizon-testnet.stellar.org',
      address: ACCOUNT,
      limit: 20,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(page.nextCursor).toBeNull();
  });

  it('surfaces a 404 as a readable inline error', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => horizonResponse([], false));

    await expect(
      fetchActivityPage({
        horizonUrl: 'https://horizon-testnet.stellar.org',
        address: ACCOUNT,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('This account has no Horizon history yet.');
  });

  it('forwards the abort signal to fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => horizonResponse([]));
    const controller = new AbortController();

    await fetchActivityPage({
      horizonUrl: 'https://horizon-testnet.stellar.org',
      address: ACCOUNT,
      signal: controller.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
