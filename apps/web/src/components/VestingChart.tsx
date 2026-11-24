'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Stream } from '@stellar-starter-kit/types';
import { bigintRatio, vestingCurve } from '@stellar-starter-kit/utils';

const WIDTH = 320;
const HEIGHT = 120;
const PAD_X = 12;
const PAD_Y = 14;
const SAMPLES = 24;

function xFor(t: number, start: number, end: number): number {
  if (end <= start) return PAD_X;
  return PAD_X + ((t - start) / (end - start)) * (WIDTH - PAD_X * 2);
}

function yFor(vested: bigint, total: bigint): number {
  const ratio = total > 0n ? bigintRatio(vested, total) : 0;
  return HEIGHT - PAD_Y - ratio * (HEIGHT - PAD_Y * 2);
}

export interface VestingChartProps {
  stream: Stream;
  /**
   * Current Unix time in seconds. Omit it in the app: the component reads the
   * clock after mount, so the server and first client render agree. Tests pass
   * a fixed value to keep every coordinate deterministic.
   */
  now?: number;
}

/**
 * Line chart of a stream's vesting schedule, drawn from `vestingCurve` so the
 * chart and the claimable math can never drift apart.
 *
 * The schedule itself is deterministic and server-renderable. Only the "now"
 * marker depends on the clock, and it appears after mount; this is what keeps
 * the server markup and the hydrated client markup identical.
 */
export function VestingChart({ stream, now: fixedNow }: VestingChartProps) {
  const [mountedNow, setMountedNow] = useState<number | null>(null);

  useEffect(() => {
    setMountedNow(Math.floor(Date.now() / 1000));
  }, []);

  const now = fixedNow ?? mountedNow;

  const { points, area, start, end, cliff, total, currentX } = useMemo(() => {
    const curve = vestingCurve(
      {
        startTime: stream.startTime,
        endTime: stream.endTime,
        cliffTime: stream.cliffTime,
        totalAmount: stream.totalAmount,
      },
      SAMPLES,
    );
    const total = BigInt(stream.totalAmount);
    const plotted = curve.map((point) => ({
      x: xFor(point.t, stream.startTime, stream.endTime),
      y: yFor(point.vested, total),
    }));
    const points = plotted.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    const baseline = HEIGHT - PAD_Y;
    const area = plotted.length
      ? `M ${plotted[0]!.x.toFixed(2)} ${baseline} L ${points.replaceAll(',', ' ')} L ${plotted[plotted.length - 1]!.x.toFixed(2)} ${baseline} Z`
      : '';
    const clamp = (value: number) =>
      Math.min(Math.max(value, stream.startTime), Math.max(stream.startTime, stream.endTime));
    const currentX = now === null ? null : xFor(clamp(now), stream.startTime, stream.endTime);

    return {
      points,
      area,
      start: xFor(stream.startTime, stream.startTime, stream.endTime),
      end: xFor(stream.endTime, stream.startTime, stream.endTime),
      cliff: xFor(stream.cliffTime, stream.startTime, stream.endTime),
      total,
      currentX,
    };
  }, [now, stream.cliffTime, stream.endTime, stream.startTime, stream.totalAmount]);

  const showCliff = stream.cliffTime > stream.startTime && stream.cliffTime < stream.endTime;
  const stroke = stream.cancelled ? '#fb7185' : '#22d3ee';

  return (
    <figure
      className="rounded-xl border border-slate-900 bg-slate-950/60 p-3"
      data-cancelled={stream.cancelled}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Vesting schedule for stream #${stream.id}: ${stream.cancelled ? 'cancelled' : 'active'}${showCliff ? ', with cliff' : ''}, current time marked`}
      >
        <line
          x1={PAD_X}
          y1={HEIGHT - PAD_Y}
          x2={WIDTH - PAD_X}
          y2={HEIGHT - PAD_Y}
          stroke="#1e293b"
          strokeWidth="1"
        />
        <line
          x1={PAD_X}
          y1={PAD_Y}
          x2={PAD_X}
          y2={HEIGHT - PAD_Y}
          stroke="#1e293b"
          strokeWidth="1"
        />

        {total > 0n ? (
          <>
            <path d={area} fill={stream.cancelled ? '#fb71851a' : '#22d3ee14'} />
            <polyline
              points={points}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={stream.cancelled ? '5 4' : undefined}
            />
          </>
        ) : null}

        {showCliff ? (
          <g>
            <line
              x1={cliff}
              y1={PAD_Y}
              x2={cliff}
              y2={HEIGHT - PAD_Y}
              stroke="#fbbf24"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text x={cliff + 4} y={PAD_Y + 9} fill="#fbbf24" fontSize="8">
              Cliff
            </text>
          </g>
        ) : null}

        {currentX !== null ? (
          <g data-testid="vesting-now-marker">
            <line
              x1={currentX}
              y1={PAD_Y}
              x2={currentX}
              y2={HEIGHT - PAD_Y}
              stroke="#cbd5e1"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <circle cx={currentX} cy={HEIGHT - PAD_Y} r="2.5" fill="#e2e8f0" />
            <text x={currentX + 4} y={HEIGHT - PAD_Y - 5} fill="#e2e8f0" fontSize="8">
              Now
            </text>
          </g>
        ) : null}

        <text x={start} y={HEIGHT - 3} fill="#64748b" fontSize="7" textAnchor="middle">
          Start
        </text>
        <text x={end} y={HEIGHT - 3} fill="#64748b" fontSize="7" textAnchor="middle">
          End
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-0.5 w-4"
            style={{ backgroundColor: stroke }}
            aria-hidden="true"
          />
          {stream.cancelled ? 'Cancelled schedule' : 'Vesting schedule'}
        </span>
        {showCliff ? <span className="text-amber-300">Cliff marker</span> : null}
        <span>Current time</span>
      </figcaption>
    </figure>
  );
}

export default VestingChart;
