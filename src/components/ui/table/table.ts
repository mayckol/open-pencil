import { tv } from 'tailwind-variants'

import type { ComponentUI } from '@/components/ui/types'
import dataTableTheme from '@/theme/table/data-table'
import tablePaginationTheme from '@/theme/table/pagination'

export const dataTable = tv(dataTableTheme)
export type DataTableUI = ComponentUI<typeof dataTableTheme>
export const tablePagination = tv(tablePaginationTheme)
export type TablePaginationUI = ComponentUI<typeof tablePaginationTheme>

/**
 * What a column says about its own look, in `columnDef.meta`: classes for its header and cells,
 * such as a width, an alignment, or hiding below a table width.
 */
export type TableColumnMeta = {
  class?: string
  /** The header is read out but not shown, as for a column of row actions. */
  headerHidden?: boolean
}

/** What a column's meta says, whatever features the table was made with. */
export function columnMeta(meta: unknown): TableColumnMeta {
  if (typeof meta !== 'object' || meta === null) return {}
  return {
    class: 'class' in meta && typeof meta.class === 'string' ? meta.class : undefined,
    headerHidden: 'headerHidden' in meta && meta.headerHidden === true
  }
}
