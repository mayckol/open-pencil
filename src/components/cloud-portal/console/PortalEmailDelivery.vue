<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'
import { computed } from 'vue'

import type { CloudAdminEmailFilter } from '@open-pencil/cloud/contract'
import { useCloudPortalMessages } from '@open-pencil/vue/i18n'

import {
  usePortalList,
  type PortalTableFeatures,
  type PortalListPage,
  type PortalListRequest
} from '@/app/cloud-portal/list'
import AppButton from '@/components/ui/button/AppButton.vue'
import { portalList } from '@/theme/cloud-portal/list'

import type { PortalEmail } from '../types'
import PortalTable from './PortalTable.vue'

/** Email the server sends, such as invitations and sign-in links, and whether it went out. */
const { load, busy = null } = defineProps<{
  load: (
    request: PortalListRequest<CloudAdminEmailFilter>
  ) => Promise<PortalListPage<CloudAdminEmailFilter, PortalEmail>>
  /** The message being sent again. */
  busy?: string | null
}>()
const emit = defineEmits<{ retry: [id: string] }>()

const ui = portalList()
const messages = useCloudPortalMessages()
const column = createColumnHelper<PortalTableFeatures, PortalEmail>()
const emails = usePortalList<CloudAdminEmailFilter, PortalEmail>({
  filter: 'all',
  load: (request) => load(request),
  rowId: (email) => email.id,
  columns: [
    column.display({ id: 'message', header: () => messages.value.columnMessage }),
    column.display({
      id: 'recipient',
      header: () => messages.value.columnRecipient,
      meta: { class: 'hidden @xl/data-table:table-cell' }
    }),
    column.display({
      id: 'status',
      header: () => messages.value.columnStatus,
      meta: { class: 'w-32' }
    }),
    column.display({
      id: 'when',
      header: () => messages.value.columnWhen,
      meta: { class: 'hidden w-44 whitespace-nowrap text-muted @2xl/data-table:table-cell' }
    }),
    column.display({
      id: 'actions',
      header: () => messages.value.columnActions,
      meta: { class: 'w-px text-right', headerHidden: true }
    })
  ]
})
const filters = computed(() => [
  { value: 'all' as const, label: messages.value.filterAll },
  { value: 'sent' as const, label: messages.value.emailSent },
  { value: 'waiting' as const, label: messages.value.emailWaiting },
  { value: 'failed' as const, label: messages.value.emailFailed }
])
const tones = {
  sent: 'success',
  waiting: 'neutral',
  failed: 'error',
  suppressed: 'neutral'
} as const
const statusLabels = computed(() => ({
  sent: messages.value.emailSent,
  waiting: messages.value.emailWaiting,
  failed: messages.value.emailFailed,
  suppressed: messages.value.emailSuppressed
}))
const kindLabels = computed<Record<string, string>>(() => ({
  'document-invitation': messages.value.emailKindInvitation,
  'workspace-invitation': messages.value.emailKindWorkspaceInvitation,
  'enrollment-requested': messages.value.emailKindEnrollmentRequested,
  'admin-enrollment-notification': messages.value.emailKindAdminNotification,
  'enrollment-approved': messages.value.emailKindEnrollmentApproved,
  'enrollment-rejected': messages.value.emailKindEnrollmentRejected,
  'enrollment-revoked': messages.value.emailKindEnrollmentRevoked,
  'email-verification': messages.value.emailKindVerification,
  'password-reset': messages.value.emailKindPasswordReset,
  'password-changed': messages.value.emailKindPasswordChanged,
  'email-change-requested': messages.value.emailKindEmailChangeRequested,
  'new-sign-in': messages.value.emailKindNewSignIn,
  'two-step-changed': messages.value.emailKindTwoStepChanged
}))
/** What went wrong, or how many tries it took. */
function delivery(email: PortalEmail) {
  if (email.error) return email.error
  return email.attempts > 1 ? messages.value.attempts(email.attempts) : null
}

defineExpose({ reload: emails.reload })
</script>

<template>
  <PortalTable
    :list="emails"
    :label="messages.emailDelivery"
    :search-label="messages.searchEmail"
    :filters="filters"
    :empty-label="messages.noEmailFound"
    :empty-description="messages.noEmailFoundDescription"
  >
    <template #icon><icon-lucide-mail class="size-5" /></template>
    <template #message="{ row: email }">
      <div class="min-w-0">
        <p :class="ui.title()">{{ kindLabels[email.kind] ?? messages.emailKindOther }}</p>
        <!-- The recipient has its own column once the table is wide enough. -->
        <p :class="[ui.detail(), '@xl/data-table:hidden']">{{ email.recipient }}</p>
      </div>
    </template>
    <template #recipient="{ row: email }">
      <span class="block truncate text-muted">{{ email.recipient }}</span>
    </template>
    <template #status="{ row: email }">
      <div class="flex flex-col items-start gap-0.5">
        <span :class="ui.status()" :data-tone="tones[email.status]">
          {{ statusLabels[email.status] }}
        </span>
        <span v-if="delivery(email)" :class="ui.detail()">{{ delivery(email) }}</span>
      </div>
    </template>
    <template #when="{ row: email }">{{ email.when }}</template>
    <template #actions="{ row: email }">
      <AppButton
        v-if="email.status === 'failed'"
        size="sm"
        variant="outline"
        :loading="busy === email.id"
        @click="emit('retry', email.id)"
      >
        {{ messages.retry }}
      </AppButton>
    </template>
  </PortalTable>
</template>
