<script setup lang="ts" generic="Features extends TableFeatures, Row extends RowData">
import { FlexRender, type RowData, type Table, type TableFeatures } from '@tanstack/vue-table'
import { computed } from 'vue'

import AppProgress from '@/components/ui/feedback/AppProgress.vue'
import AppSkeleton from '@/components/ui/feedback/AppSkeleton.vue'
import { skeleton } from '@/components/ui/feedback/skeleton'

import { columnMeta, dataTable, type DataTableUI } from './table'

/** How many rows of placeholders stand in for rows that have not loaded. */
const PLACEHOLDER_ROWS = 5

/**
 * Rows under labelled columns, from a TanStack table. A column's cells come from the slot named
 * after its id, given the row, or from the column's own `cell`; `hidden` leaves columns out.
 * Before its first rows load it shows placeholder rows in its own columns; while newer rows load
 * it keeps the old ones, faded, under a pulsing bar.
 */
const {
  table,
  label,
  hidden = [],
  loading = false,
  ui
} = defineProps<{
  table: Table<Features, Row>
  /** What the table lists, for assistive technology. */
  label: string
  hidden?: readonly string[]
  /** `first` before any rows have loaded, `refresh` while newer rows replace the shown ones. */
  loading?: 'first' | 'refresh' | false
  ui?: DataTableUI
}>()
defineSlots<
  { empty?: () => unknown; footer?: () => unknown } & Record<
    string,
    ((props: { row: Row }) => unknown) | undefined
  >
>()

const styles = computed(() => {
  const theme = dataTable()
  return {
    root: theme.root({ class: ui?.root }),
    scroller: theme.scroller({ class: ui?.scroller }),
    table: theme.table({ class: ui?.table }),
    header: theme.header({ class: ui?.header }),
    headerCell: theme.headerCell({ class: ui?.headerCell }),
    row: theme.row({ class: ui?.row }),
    cell: theme.cell({ class: ui?.cell }),
    empty: theme.empty({ class: ui?.empty }),
    body: theme.body({ class: ui?.body }),
    refresh: theme.refresh({ class: ui?.refresh }),
    footer: theme.footer({ class: ui?.footer })
  }
})
const shown = (column: { id: string }) => !hidden.includes(column.id)
const headerGroups = computed(() =>
  table.getHeaderGroups().map((group) => ({
    id: group.id,
    headers: group.headers.filter((header) => shown(header.column))
  }))
)
const rows = computed(() =>
  table.getRowModel().rows.map((row) => ({
    row,
    cells: row.getAllCells().filter((cell) => shown(cell.column))
  }))
)
const columnCount = computed(() => headerGroups.value.at(-1)?.headers.length ?? 1)
const leafHeaders = computed(() => headerGroups.value.at(-1)?.headers ?? [])
const placeholders = skeleton()
</script>

<template>
  <div :class="styles.root" :aria-busy="loading ? true : undefined">
    <div
      v-if="loading === 'refresh'"
      :class="[styles.refresh, placeholders.group()]"
      aria-hidden="true"
    >
      <AppProgress :amount="{}" :ui="{ track: 'h-0.5 rounded-none bg-transparent' }" />
    </div>
    <div :class="styles.scroller">
      <table :class="styles.table" :aria-label="label">
        <thead :class="styles.header">
          <tr v-for="group in headerGroups" :key="group.id">
            <th
              v-for="header in group.headers"
              :key="header.id"
              scope="col"
              :colspan="header.colSpan"
              :class="[styles.headerCell, columnMeta(header.column.columnDef.meta).class]"
            >
              <span
                v-if="!header.isPlaceholder"
                :class="{ 'sr-only': columnMeta(header.column.columnDef.meta).headerHidden }"
              >
                <FlexRender :header="header" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody v-if="loading === 'first'" :class="placeholders.group()" data-slot="placeholders">
          <tr v-for="index in PLACEHOLDER_ROWS" :key="index" :class="styles.row">
            <td
              v-for="(header, column) in leafHeaders"
              :key="header.id"
              :class="[styles.cell, columnMeta(header.column.columnDef.meta).class]"
            >
              <!-- The first column names the row, so it gets the longer bar; actions get none. -->
              <AppSkeleton
                v-if="!columnMeta(header.column.columnDef.meta).headerHidden"
                :class="column === 0 ? 'w-40 max-w-full' : 'w-16 max-w-full'"
              />
            </td>
          </tr>
        </tbody>
        <tbody v-else :class="styles.body" :data-refreshing="loading === 'refresh' || undefined">
          <tr v-for="{ row, cells } in rows" :key="row.id" :class="styles.row">
            <td
              v-for="cell in cells"
              :key="cell.id"
              :class="[styles.cell, columnMeta(cell.column.columnDef.meta).class]"
            >
              <slot :name="cell.column.id" :row="row.original">
                <FlexRender :cell="cell" />
              </slot>
            </td>
          </tr>
          <tr v-if="!rows.length && $slots.empty">
            <td :colspan="columnCount" :class="styles.empty"><slot name="empty" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="$slots.footer" :class="styles.footer"><slot name="footer" /></div>
  </div>
</template>
