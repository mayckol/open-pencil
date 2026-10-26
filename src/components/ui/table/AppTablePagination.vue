<script setup lang="ts">
import { computed } from 'vue'

import IconButton from '@/components/ui/button/IconButton.vue'

import { tablePagination, type TablePaginationUI } from './table'

/** Where a page sits among a table's rows, and the buttons to the pages either side. */
const { range, canPrevious, canNext, previousLabel, nextLabel, ui } = defineProps<{
  /** Which rows the page shows of how many, such as “51–100 of 230”. */
  range: string
  canPrevious: boolean
  canNext: boolean
  previousLabel: string
  nextLabel: string
  ui?: TablePaginationUI
}>()
const emit = defineEmits<{ previous: []; next: [] }>()

const styles = computed(() => {
  const theme = tablePagination()
  return {
    root: theme.root({ class: ui?.root }),
    range: theme.range({ class: ui?.range }),
    buttons: theme.buttons({ class: ui?.buttons })
  }
})
</script>

<template>
  <div :class="styles.root">
    <span :class="styles.range">{{ range }}</span>
    <div :class="styles.buttons">
      <IconButton :label="previousLabel" :disabled="!canPrevious" @click="emit('previous')">
        <icon-lucide-chevron-left class="size-3.5" />
      </IconButton>
      <IconButton :label="nextLabel" :disabled="!canNext" @click="emit('next')">
        <icon-lucide-chevron-right class="size-3.5" />
      </IconButton>
    </div>
  </div>
</template>
