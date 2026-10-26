<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'
import { computed } from 'vue'

import type { CloudAdminAuditFilter } from '@open-pencil/cloud/contract'
import { useCloudPortalMessages } from '@open-pencil/vue/i18n'

import {
  usePortalList,
  type PortalTableFeatures,
  type PortalListPage,
  type PortalListRequest
} from '@/app/cloud-portal/list'
import AccountAvatar from '@/components/presence/AccountAvatar.vue'
import { portalList } from '@/theme/cloud-portal/list'

import type { PortalActivityEntry } from '../types'
import PortalTable from './PortalTable.vue'

/** What administrators did on the server, newest first. */
const { load } = defineProps<{
  load: (
    request: PortalListRequest<CloudAdminAuditFilter>
  ) => Promise<PortalListPage<CloudAdminAuditFilter, PortalActivityEntry>>
}>()

const ui = portalList()
const messages = useCloudPortalMessages()
const column = createColumnHelper<PortalTableFeatures, PortalActivityEntry>()
const activity = usePortalList<CloudAdminAuditFilter, PortalActivityEntry>({
  filter: 'all',
  load: (request) => load(request),
  rowId: (entry) => entry.id,
  columns: [
    column.display({
      id: 'administrator',
      header: () => messages.value.columnAdministrator,
      meta: { class: 'w-1/4' }
    }),
    column.display({ id: 'action', header: () => messages.value.columnAction }),
    column.display({
      id: 'subject',
      header: () => messages.value.columnSubject,
      meta: { class: 'hidden w-1/4 @xl/data-table:table-cell' }
    }),
    column.display({
      id: 'when',
      header: () => messages.value.columnWhen,
      meta: { class: 'hidden w-44 whitespace-nowrap text-muted @2xl/data-table:table-cell' }
    })
  ]
})
const filters = computed(() => [
  { value: 'all' as const, label: messages.value.filterAll },
  { value: 'accounts' as const, label: messages.value.filterAccounts },
  { value: 'requests' as const, label: messages.value.filterRequests },
  { value: 'email' as const, label: messages.value.filterEmail }
])
const actions = computed<Record<string, string>>(() => ({
  'enrollment.approved': messages.value.activityApproved,
  'enrollment.rejected': messages.value.activityRejected,
  'enrollment.revoked': messages.value.activityRevoked,
  'user.banned': messages.value.activitySuspended,
  'user.unbanned': messages.value.activityRestored,
  'user.sessions-revoked': messages.value.activitySignedOut,
  'user.admin-granted': messages.value.activityMadeAdmin,
  'user.admin-revoked': messages.value.activityRemovedAdmin,
  'email.regenerated': messages.value.activityEmailRetried,
  'user.two-step-reset': messages.value.activityTwoStepReset,
  'user.picture-removed': messages.value.activityPictureRemoved
}))
</script>

<template>
  <PortalTable
    :list="activity"
    :label="messages.activity"
    :search-label="messages.searchActivity"
    :filters="filters"
    :empty-label="messages.noActivityFound"
    :empty-description="messages.noActivityFoundDescription"
  >
    <template #icon><icon-lucide-history class="size-5" /></template>
    <template #administrator="{ row: entry }">
      <div class="flex min-w-0 items-center gap-2">
        <AccountAvatar :id="entry.actor.id" :name="entry.actor.name" />
        <span class="truncate font-medium">{{ entry.actor.name }}</span>
      </div>
    </template>
    <template #action="{ row: entry }">
      <p>
        {{ actions[entry.action] ?? messages.activityChanged }}
        <!-- The subject has its own column once the table is wide enough. -->
        <span class="@xl/data-table:hidden">{{ entry.target }}</span>
      </p>
      <p v-if="entry.reason" :class="ui.detail()">
        {{ messages.activityReason({ reason: entry.reason }) }}
      </p>
    </template>
    <template #subject="{ row: entry }">
      <span class="block truncate">{{ entry.target }}</span>
    </template>
    <template #when="{ row: entry }">{{ entry.when }}</template>
  </PortalTable>
</template>
