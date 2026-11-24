import * as React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable, type DataTableColumn } from './DataTable';

interface Row {
  id: string;
  name: string;
  amount: number;
}

const rows: Row[] = [
  { id: 'b', name: 'Beta', amount: 20 },
  { id: 'a', name: 'Alpha', amount: 30 },
  { id: 'c', name: 'Gamma', amount: 10 },
];

const columns: DataTableColumn<Row>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: (row) => row.name,
    sortable: true,
    sortValue: (row) => row.name,
  },
  {
    id: 'amount',
    header: 'Amount',
    cell: (row) => row.amount,
    sortable: true,
    sortValue: (row) => row.amount,
  },
  { id: 'id', header: 'ID', cell: (row) => row.id },
];

function names(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent ?? '');
}

describe('DataTable', () => {
  it('renders typed columns and rows with an accessible caption', () => {
    render(
      <DataTable
        caption="Example rows"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
      />,
    );

    expect(screen.getByRole('table', { name: 'Example rows' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeDefined();
    expect(names()).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('sorts ascending then descending and exposes aria-sort on sortable headers only', () => {
    render(
      <DataTable
        caption="Example rows"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
      />,
    );

    const nameHeader = screen.getByRole('columnheader', { name: /name/i });
    const idHeader = screen.getByRole('columnheader', { name: 'ID' });
    expect(nameHeader.getAttribute('aria-sort')).toBe('none');
    expect(idHeader.hasAttribute('aria-sort')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /name/i }));
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);

    fireEvent.click(screen.getByRole('button', { name: /name/i }));
    expect(nameHeader.getAttribute('aria-sort')).toBe('descending');
    expect(names()).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts numeric columns numerically and reports changes', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        caption="Example rows"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /amount/i }));

    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'amount', direction: 'ascending' });
    expect(names()).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('renders the loading slot instead of the table', () => {
    render(
      <DataTable
        caption="Example rows"
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        loading
        loadingState={<p>Loading rows…</p>}
      />,
    );

    expect(screen.getByText('Loading rows…')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders the empty slot when there are no rows', () => {
    render(
      <DataTable
        caption="Example rows"
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        emptyState={<p>Nothing here yet.</p>}
      />,
    );

    expect(screen.getByText('Nothing here yet.')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
