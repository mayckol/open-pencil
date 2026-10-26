<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'
import { computed, ref } from 'vue'

import { useCloudPortalMessages } from '@open-pencil/vue/i18n'

import {
  usePortalList,
  type PortalTableFeatures,
  type PortalListPage,
  type PortalListRequest
} from '@/app/cloud-portal/list'
import AccountAvatar from '@/components/presence/AccountAvatar.vue'
import AppButton from '@/components/ui/button/AppButton.vue'
import AppConfirmationDialog from '@/components/ui/dialog/AppConfirmationDialog.vue'
import AppTextarea from '@/components/ui/input/AppTextarea.vue'
import { useHeldContent } from '@/components/ui/overlay/held'
import { portalForm } from '@/theme/cloud-portal/form'
import { portalList } from '@/theme/cloud-portal/list'

import type { AccessRequest, AccessRequestStatus } from '../types'
import PortalRowMenu from './PortalRowMenu.vue'
import PortalTable from './PortalTable.vue'

/** People asking to join a server that reviews new accounts, and the decisions made so far. */
const { load, busy = null } = defineProps<{
  load: (
    request: PortalListRequest<AccessRequestStatus>
  ) => Promise<PortalListPage<AccessRequestStatus, AccessRequest>>
  /** The request a decision is being saved for. */
  busy?: string | null
}>()
const emit = defineEmits<{
  approve: [id: string]
  reject: [id: string, note?: string]
  revoke: [id: string, note?: string]
}>()

const ui = portalList()
const form = portalForm()
const messages = useCloudPortalMessages()
const column = createColumnHelper<PortalTableFeatures, AccessRequest>()
const requests = usePortalList<AccessRequestStatus, AccessRequest>({
  filter: 'pending',
  load: (request) => load(request),
  rowId: (request) => request.id,
  columns: [
    column.display({ id: 'person', header: () => messages.value.columnPerson }),
    column.display({
      id: 'reason',
      header: () => messages.value.columnReason,
      meta: { class: 'hidden w-2/5 @2xl/data-table:table-cell' }
    }),
    column.display({
      id: 'requested',
      header: () => messages.value.columnRequested,
      meta: { class: 'hidden w-28 whitespace-nowrap text-muted @xl/data-table:table-cell' }
    }),
    column.display({
      id: 'decision',
      header: () => messages.value.columnDecision,
      meta: { class: 'hidden @3xl/data-table:table-cell' }
    }),
    column.display({
      id: 'actions',
      header: () => messages.value.columnActions,
      meta: { class: 'w-px whitespace-nowrap text-right', headerHidden: true }
    })
  ]
})
const filters = computed(() => [
  { value: 'pending' as const, label: messages.value.filterWaiting },
  { value: 'approved' as const, label: messages.value.filterApproved },
  { value: 'rejected' as const, label: messages.value.filterDeclined },
  { value: 'revoked' as const, label: messages.value.filterRemoved }
])
// Waiting requests have no decision yet.
const hidden = computed(() => (requests.filter.value === 'pending' ? ['decision'] : []))
const labels = computed(() => ({
  pending: messages.value.statusWaiting,
  approved: messages.value.statusApproved,
  rejected: messages.value.statusDeclined,
  revoked: messages.value.statusRemoved
}))
const name = (request: AccessRequest) => request.name ?? request.email

function menuItems(request: AccessRequest) {
  if (request.status === 'pending') {
    return [{ action: 'reject' as const, label: messages.value.decline }]
  }
  if (request.status === 'approved') {
    return [{ action: 'revoke' as const, label: messages.value.removeAccess }]
  }
  return []
}

/** Declining or taking access away is asked once more, with a note for the other administrators. */
const confirming = ref<{ kind: 'reject' | 'revoke'; request: AccessRequest } | null>(null)
const note = ref('')
const confirmingShown = useHeldContent(confirming)
const confirmation = computed(() => {
  const pending = confirmingShown.value
  if (!pending) return null
  const words = messages.value
  return pending.kind === 'reject'
    ? {
        heading: words.declineHeading({ name: name(pending.request) }),
        description: words.declineDescription,
        confirm: words.decline
      }
    : {
        heading: words.removeAccessHeading({ name: name(pending.request) }),
        description: words.removeAccessDescription,
        confirm: words.removeAccess
      }
})
function ask(kind: 'reject' | 'revoke', request: AccessRequest) {
  note.value = ''
  confirming.value = { kind, request }
}
function confirm() {
  const pending = confirming.value
  confirming.value = null
  if (!pending) return
  const written = note.value.trim() || undefined
  if (pending.kind === 'reject') emit('reject', pending.request.id, written)
  else emit('revoke', pending.request.id, written)
}

defineExpose({ reload: requests.reload })
</script>

<template>
  <PortalTable
    :list="requests"
    :label="messages.accessRequests"
    :search-label="messages.searchRequests"
    :filters="filters"
    :hidden="hidden"
    :empty-label="
      requests.filter.value === 'pending' ? messages.noOneWaiting : messages.nothingHere
    "
    :empty-description="messages.requestsEmptyDescription"
  >
    <template #icon><icon-lucide-inbox class="size-5" /></template>
    <template #person="{ row: request }">
      <div class="flex min-w-0 items-center gap-3">
        <AccountAvatar :id="request.email" :name="name(request)" size="md" />
        <div class="min-w-0">
          <p :class="ui.title()">{{ name(request) }}</p>
          <p v-if="request.name" :class="ui.detail()">{{ request.email }}</p>
        </div>
      </div>
    </template>
    <template #reason="{ row: request }">
      <p v-if="request.reason" :class="ui.quote()">“{{ request.reason }}”</p>
    </template>
    <template #requested="{ row: request }">{{ request.requestedOn }}</template>
    <template #decision="{ row: request }">
      <p v-if="request.reviewedBy" class="text-[11px] text-muted">
        {{ messages.reviewedBy({ decision: labels[request.status], name: request.reviewedBy }) }}
      </p>
      <p v-if="request.note" :class="ui.quote()">
        {{ messages.noteDetail({ note: request.note }) }}
      </p>
    </template>
    <template #actions="{ row: request }">
      <div :class="ui.actions()">
        <AppButton
          v-if="request.status === 'pending'"
          size="sm"
          color="primary"
          variant="solid"
          :loading="busy === request.id"
          @click="emit('approve', request.id)"
        >
          {{ messages.approve }}
        </AppButton>
        <PortalRowMenu
          v-if="menuItems(request).length"
          :label="messages.actionsFor({ name: name(request) })"
          :items="menuItems(request)"
          :disabled="busy === request.id"
          @select="(kind) => ask(kind, request)"
        />
      </div>
    </template>
  </PortalTable>
  <AppConfirmationDialog
    :open="confirming !== null"
    tone="danger"
    :heading="confirmation?.heading ?? ''"
    :description="confirmation?.description"
    :cancel-label="messages.cancel"
    :confirm-label="confirmation?.confirm ?? ''"
    @update:open="(open) => !open && (confirming = null)"
    @confirm="confirm"
  >
    <div :class="[form.field(), 'mt-3']">
      <label for="portal-review-note" :class="form.label()">{{ messages.reviewNote }}</label>
      <AppTextarea id="portal-review-note" v-model="note" :rows="2" maxlength="1000" />
    </div>
  </AppConfirmationDialog>
</template>
