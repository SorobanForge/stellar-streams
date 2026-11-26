import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from './utils';

/** Ascending or descending order for a sorted column. */
export type SortDirection = 'ascending' | 'descending';

/** Which column the table is sorted by, and in which direction. */
export interface DataTableSort {
  columnId: string;
  direction: SortDirection;
}

interface DataTableColumnBase<T> {
  /** Stable identifier, also used as the sort key. */
  id: string;
  /** Header content; plain text is the common case. */
  header: React.ReactNode;
  /** Renders one row's cell for this column. */
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  /** Extra classes for body cells. */
  className?: string;
}

/**
 * A column is either non-sortable, or sortable with a required `sortValue`
 * accessor. Making `sortValue` required for sortable columns keeps the sort
 * key separate from the rendered cell, which may be arbitrary markup.
 */
export type DataTableColumn<T> = DataTableColumnBase<T> &
  (
    | { sortable?: false; sortValue?: (row: T) => string | number }
    | { sortable: true; sortValue: (row: T) => string | number }
  );

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  /** Stable key for a row; usually its id. */
  getRowKey: (row: T) => React.Key;
  /** Accessible table name, rendered as a visually hidden `<caption>`. */
  caption: string;
  /** Slot shown instead of the table while `loading` is true. */
  loading?: boolean;
  loadingState?: React.ReactNode;
  /** Slot shown instead of the table when there are no rows. */
  emptyState?: React.ReactNode;
  /** Initial sort, e.g. newest streams first. Uncontrolled afterwards. */
  initialSort?: DataTableSort | null;
  /** Called after a header click with the new sort. */
  onSortChange?: (sort: DataTableSort) => void;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

/** Compares sort values, numerically when both are numbers. */
function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function SortIcon({ direction }: { direction: DataTableSort['direction'] | null }) {
  const Icon =
    direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowUpDown;
  return <Icon aria-hidden="true" className="h-3 w-3 shrink-0 opacity-70" />;
}

/**
 * Sortable data table with typed columns and slot-based loading/empty states.
 *
 * Sorting is internal and starts at `initialSort`; clicking a sortable header
 * cycles ascending → descending. `aria-sort` is set on every sortable header
 * ("none" when inactive) so assistive technology can announce the state, and
 * the header control is a real `<button>` so it is keyboard reachable.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  loading = false,
  loadingState,
  emptyState,
  initialSort = null,
  onSortChange,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<DataTableSort | null>(initialSort);

  const sortedRows = React.useMemo(() => {
    if (!sort) return rows;

    const column = columns.find((candidate) => candidate.id === sort.columnId);
    const sortValue = column?.sortValue;
    if (!column?.sortable || !sortValue) return rows;

    const factor = sort.direction === 'ascending' ? 1 : -1;
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const result = compareValues(sortValue(a.row), sortValue(b.row));
        // Fall back to source order so equal values stay stable everywhere.
        return result !== 0 ? result * factor : a.index - b.index;
      })
      .map(({ row }) => row);
  }, [columns, rows, sort]);

  function toggleSort(columnId: string): void {
    const next: DataTableSort =
      sort?.columnId === columnId
        ? {
            columnId,
            direction: sort.direction === 'ascending' ? 'descending' : 'ascending',
          }
        : { columnId, direction: 'ascending' };

    setSort(next);
    onSortChange?.(next);
  }

  if (loading) return <>{loadingState ?? null}</>;
  if (rows.length === 0) return <>{emptyState ?? null}</>;

  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-slate-900 bg-slate-950/40')}>
      <table className={cn('w-full text-left text-xs', className)}>
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-slate-900 bg-slate-900/30 text-slate-400 uppercase">
          <tr>
            {columns.map((column) => {
              const activeDirection =
                sort && column.sortable && sort.columnId === column.id ? sort.direction : null;
              const ariaSort = activeDirection ?? (column.sortable ? 'none' : undefined);
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn('px-4 py-3 font-semibold', alignClasses[column.align ?? 'left'])}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.id)}
                      className="inline-flex items-center gap-1.5 rounded-sm text-inherit uppercase transition hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                    >
                      {column.header}
                      <SortIcon direction={activeDirection} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-900 text-slate-300">
          {sortedRows.map((row) => (
            <tr
              key={getRowKey(row)}
              className={cn('transition-colors hover:bg-slate-900/20', rowClassName?.(row))}
            >
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={cn(
                    'px-4 py-3',
                    alignClasses[column.align ?? 'left'],
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
