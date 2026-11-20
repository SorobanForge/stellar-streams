import { toCsv, formatTokenAmount } from '@stellar-starter-kit/utils';
import type { Stream } from '@stellar-starter-kit/types';

export const STREAM_CSV_COLUMNS = [
  'id',
  'sender',
  'recipient',
  'token',
  'totalAmountRaw',
  'totalAmountFormatted',
  'withdrawnRaw',
  'withdrawnFormatted',
  'startTime',
  'endTime',
  'cliffTime',
  'cancelled',
  'label',
  'reference',
] as const;

export type StreamCsvColumn = (typeof STREAM_CSV_COLUMNS)[number];

export interface StreamCsvRecord {
  id: string;
  sender: string;
  recipient: string;
  token: string;
  totalAmountRaw: string;
  totalAmountFormatted: string;
  withdrawnRaw: string;
  withdrawnFormatted: string;
  startTime: number;
  endTime: number;
  cliffTime: number;
  cancelled: boolean;
  label: string;
  reference: string;
}

export function formatStreamForCsv(stream: Stream, decimals = 7): StreamCsvRecord {
  return {
    id: stream.id,
    sender: stream.sender,
    recipient: stream.recipient,
    token: stream.token,
    totalAmountRaw: stream.totalAmount,
    totalAmountFormatted: formatTokenAmount(stream.totalAmount, decimals),
    withdrawnRaw: stream.withdrawn,
    withdrawnFormatted: formatTokenAmount(stream.withdrawn, decimals),
    startTime: stream.startTime,
    endTime: stream.endTime,
    cliffTime: stream.cliffTime,
    cancelled: stream.cancelled,
    label: stream.label ?? '',
    reference: stream.reference ?? '',
  };
}

export function exportStreamsToCsv(streams: readonly Stream[], decimals = 7): string {
  const records = streams.map((s) => formatStreamForCsv(s, decimals));
  return toCsv(records, STREAM_CSV_COLUMNS);
}

export function getStreamsCsvFilename(network: string, address: string): string {
  return `streams-${network.toLowerCase()}-${address}.csv`;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
