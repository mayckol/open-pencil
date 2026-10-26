/**
 * What a column says about its own look, in its TanStack `meta`: classes for its header and cells,
 * such as a width, an alignment, or hiding below a table width.
 */
export type TableColumnMeta = {
  class?: string
  /** The header is read out but not shown, as for a column of row actions. */
  headerHidden?: boolean
}

/** A column's meta as `TableColumnMeta`, whatever features its table was made with. */
export function tableColumnMeta(meta: unknown): TableColumnMeta {
  if (typeof meta !== 'object' || meta === null) return {}
  return {
    class: 'class' in meta && typeof meta.class === 'string' ? meta.class : undefined,
    headerHidden: 'headerHidden' in meta && meta.headerHidden === true
  }
}
