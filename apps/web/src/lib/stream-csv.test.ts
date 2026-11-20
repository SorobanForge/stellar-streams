import { describe, expect, it } from 'vitest';
import type { Stream } from '@stellar-starter-kit/types';
import {
  exportStreamsToCsv,
  formatStreamForCsv,
  getStreamsCsvFilename,
  STREAM_CSV_COLUMNS,
} from './stream-csv';

describe('stream-csv export', () => {
  const sampleStream: Stream = {
    id: '1',
    sender: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAc3LM2T2NY2424',
    recipient: 'GC2B262OCPB4IA7CBZ77GLL7CQK7747754S727772656372657424242',
    token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    totalAmount: '1000000000', // 100 XLM (7 decimals)
    withdrawn: '250000000', // 25 XLM (7 decimals)
    startTime: 1700000000,
    endTime: 1702592000,
    cliffTime: 1700500000,
    cancelled: false,
    label: 'Engineering Bonus',
    reference: 'INV-2024-001',
  };

  it('generates filename including network and connected address', () => {
    const filename = getStreamsCsvFilename(
      'testnet',
      'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAc3LM2T2NY2424',
    );
    expect(filename).toBe(
      'streams-testnet-GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAc3LM2T2NY2424.csv',
    );
  });

  it('formats stream with both raw stroops and formatted amounts', () => {
    const record = formatStreamForCsv(sampleStream, 7);

    expect(record.totalAmountRaw).toBe('1000000000');
    expect(record.totalAmountFormatted).toBe('100');
    expect(record.withdrawnRaw).toBe('250000000');
    expect(record.withdrawnFormatted).toBe('25');
  });

  it('exports CSV with stable column order, asserting header row and data row', () => {
    const csv = exportStreamsToCsv([sampleStream], 7);
    const rows = csv.split('\r\n');

    // Header row assertion
    expect(rows[0]).toBe(STREAM_CSV_COLUMNS.join(','));

    // Data row assertion
    const dataColumns = rows[1].split(',');
    expect(dataColumns[0]).toBe('1'); // id
    expect(dataColumns[1]).toBe(sampleStream.sender);
    expect(dataColumns[2]).toBe(sampleStream.recipient);
    expect(dataColumns[3]).toBe(sampleStream.token);
    expect(dataColumns[4]).toBe('1000000000'); // raw total
    expect(dataColumns[5]).toBe('100'); // formatted total
    expect(dataColumns[6]).toBe('250000000'); // raw withdrawn
    expect(dataColumns[7]).toBe('25'); // formatted withdrawn
    expect(dataColumns[8]).toBe(String(sampleStream.startTime));
    expect(dataColumns[9]).toBe(String(sampleStream.endTime));
    expect(dataColumns[10]).toBe(String(sampleStream.cliffTime));
    expect(dataColumns[11]).toBe('false'); // cancelled
    expect(dataColumns[12]).toBe(sampleStream.label);
    expect(dataColumns[13]).toBe(sampleStream.reference);
  });

  it('produces header row only when streams list is empty', () => {
    const csv = exportStreamsToCsv([]);
    expect(csv).toBe(STREAM_CSV_COLUMNS.join(','));
  });
});
