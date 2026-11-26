import { describe, it, expect } from 'vitest';
import { WatchAdapter } from './watch';
import { NotSupportedError } from '../errors';

const VALID_ADDRESS = 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';
const VALID_CONTRACT = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';

describe('WatchAdapter', () => {
  function newAdapter(): WatchAdapter {
    return new WatchAdapter();
  }

  it('has id watch and name Watch address', () => {
    const adapter = newAdapter();
    expect(adapter.id).toBe('watch');
    expect(adapter.name).toBe('Watch address');
  });

  it('isAvailable reports true without an extension', async () => {
    const adapter = newAdapter();
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('watch accepts a valid account address', async () => {
    const adapter = newAdapter();
    await expect(adapter.watch(VALID_ADDRESS)).resolves.toBe(VALID_ADDRESS);
    await expect(adapter.getPublicKey()).resolves.toBe(VALID_ADDRESS);
  });

  it('watch accepts a valid contract address', async () => {
    const adapter = newAdapter();
    await expect(adapter.watch(VALID_CONTRACT)).resolves.toBe(VALID_CONTRACT);
  });

  it('connect returns the watched address', async () => {
    const adapter = newAdapter();
    await adapter.watch(VALID_ADDRESS);
    await expect(adapter.connect()).resolves.toBe(VALID_ADDRESS);
  });

  it('connect watches an address passed directly', async () => {
    const adapter = newAdapter();
    await expect(adapter.connect(VALID_ADDRESS)).resolves.toBe(VALID_ADDRESS);
  });

  it('connect throws when no address has been watched', async () => {
    const adapter = newAdapter();
    await expect(adapter.connect()).rejects.toThrow(
      'No address is being watched. Call watch() with a valid Stellar address first.',
    );
  });

  it('watch rejects an invalid address', async () => {
    const adapter = newAdapter();
    await expect(adapter.watch('not-an-address')).rejects.toThrow(
      'Invalid watch address: not-an-address. Expected a G... account address or C... contract address.',
    );
    await expect(adapter.watch('')).rejects.toThrow('Invalid watch address');
    await expect(adapter.getPublicKey()).rejects.toThrow('No address is being watched');
  });

  it('signTransaction rejects with a clear error', async () => {
    const adapter = newAdapter();
    await adapter.watch(VALID_ADDRESS);
    await expect(adapter.signTransaction('xdr')).rejects.toThrow(NotSupportedError);
    await expect(adapter.signTransaction('xdr')).rejects.toThrow(
      'Watch address does not support signTransaction.',
    );
  });

  it('signAuthEntry rejects with a clear error', async () => {
    const adapter = newAdapter();
    await adapter.watch(VALID_ADDRESS);
    await expect(adapter.signAuthEntry('entry-xdr')).rejects.toThrow(NotSupportedError);
    await expect(adapter.signAuthEntry('entry-xdr')).rejects.toThrow(
      'Watch address does not support signAuthEntry.',
    );
  });
});
