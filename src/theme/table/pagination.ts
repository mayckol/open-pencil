const tablePaginationTheme = {
  slots: {
    root: 'flex items-center justify-between gap-2 text-[11px] text-muted',
    range: 'tabular-nums',
    buttons: 'flex items-center gap-0.5'
  }
} as const

export type TablePaginationTheme = typeof tablePaginationTheme
export default tablePaginationTheme
