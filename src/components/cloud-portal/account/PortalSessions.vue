<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'
import { computed, ref } from 'vue'

import { useCloudPortalMessages } from '@open-pencil/vue/i18n'

import { usePortalDeviceLabels } from '@/app/cloud-portal/devices'
import { usePortalRows, type PortalTableFeatures } from '@/app/cloud-portal/list'
import SettingsSection from '@/components/settings/layout/SettingsSection.vue'
import AppButton from '@/components/ui/button/AppButton.vue'
import AppConfirmationDialog from '@/components/ui/dialog/AppConfirmationDialog.vue'
import AppBadge from '@/components/ui/feedback/AppBadge.vue'
import { useHeldContent } from '@/components/ui/overlay/held'
import AppDataTable from '@/components/ui/table/AppDataTable.vue'
import { portalList } from '@/theme/cloud-portal/list'

import type { PortalDevice, PortalSession, PortalSignIn } from '../types'

/**
 * Where an account is signed in and when it signed in. On the person's own account each other
 * session can be signed out, one at a time or all together, each asked once more; an
 * administrator reads them as they are.
 */
const {
  sessions,
  signIns,
  manage = false,
  busy = false,
  loading = false
} = defineProps<{
  sessions: PortalSession[]
  signIns: PortalSignIn[]
  /** The person's own sessions, which they can sign out. */
  manage?: boolean
  busy?: boolean
  /** `first` before anything has loaded, `refresh` while it loads again. */
  loading?: 'first' | 'refresh' | false
}>()
const emit = defineEmits<{ revoke: [sessionId: string]; revokeOthers: [] }>()

const ui = portalList()
const messages = useCloudPortalMessages()
const labels = usePortalDeviceLabels()
const others = computed(() => sessions.filter((session) => !session.current))
const confirming = ref<{ kind: 'one'; session: PortalSession } | { kind: 'others' } | null>(null)
const confirmingShown = useHeldContent(confirming)
const confirmation = computed(() => {
  const pending = confirmingShown.value
  if (!pending) return null
  const words = messages.value
  return pending.kind === 'others'
    ? {
        heading: words.signOutOtherSessionsHeading,
        description: words.signOutOtherSessionsDescription,
        confirm: words.signOutOtherSessions
      }
    : {
        heading: words.endSessionHeading({ device: labels.device(pending.session) }),
        description: words.endSessionDescription,
        confirm: words.signOut
      }
})

const signedInWith = (device: PortalDevice) =>
  device.method ? messages.value.signedInWith({ method: labels.method(device.method) }) : null

const address = {
  header: () => messages.value.columnAddress,
  meta: { class: 'hidden w-36 whitespace-nowrap text-muted tabular-nums @xl/data-table:table-cell' }
}
const sessionColumn = createColumnHelper<PortalTableFeatures, PortalSession>()
const sessionTable = usePortalRows(() => sessions, {
  rowId: (session) => session.id,
  columns: [
    sessionColumn.display({ id: 'device', header: () => messages.value.columnDevice }),
    sessionColumn.display({ id: 'address', ...address }),
    sessionColumn.display({
      id: 'signedIn',
      header: () => messages.value.columnSignedIn,
      meta: { class: 'hidden w-32 whitespace-nowrap text-muted @2xl/data-table:table-cell' }
    }),
    sessionColumn.display({
      id: 'lastActive',
      header: () => messages.value.columnLastActive,
      meta: { class: 'w-32 whitespace-nowrap text-muted' }
    }),
    sessionColumn.display({
      id: 'actions',
      header: () => messages.value.columnActions,
      meta: { class: 'w-px text-right', headerHidden: true }
    })
  ]
})
const signInColumn = createColumnHelper<PortalTableFeatures, PortalSignIn>()
const signInTable = usePortalRows(() => signIns, {
  rowId: (signIn) => signIn.id,
  columns: [
    signInColumn.display({ id: 'device', header: () => messages.value.columnDevice }),
    signInColumn.display({ id: 'address', ...address }),
    signInColumn.display({
      id: 'when',
      header: () => messages.value.columnWhen,
      meta: { class: 'w-44 whitespace-nowrap text-muted' }
    })
  ]
})

function confirm() {
  const pending = confirming.value
  confirming.value = null
  if (pending?.kind === 'others') emit('revokeOthers')
  else if (pending) emit('revoke', pending.session.id)
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6">
    <SettingsSection>
      <template #title>{{ messages.activeSessions }}</template>
      <template v-if="manage" #description>{{ messages.activeSessionsDescription }}</template>
      <template v-if="manage && others.length" #actions>
        <AppButton
          size="sm"
          variant="outline"
          :disabled="busy"
          @click="confirming = { kind: 'others' }"
        >
          {{ messages.signOutOtherSessions }}
        </AppButton>
      </template>
      <AppDataTable
        :table="sessionTable"
        :label="messages.activeSessions"
        :loading="loading"
        :hidden="manage ? [] : ['actions']"
      >
        <template #device="{ row: session }">
          <div class="flex min-w-0 items-center gap-3">
            <icon-lucide-app-window
              v-if="session.method === 'desktop'"
              class="size-4 shrink-0 text-muted"
            />
            <icon-lucide-globe v-else class="size-4 shrink-0 text-muted" />
            <div class="min-w-0">
              <p :class="ui.title()">
                {{ labels.device(session) }}
                <AppBadge v-if="session.current">{{ messages.thisSession }}</AppBadge>
              </p>
              <p v-if="signedInWith(session)" :class="ui.detail()">{{ signedInWith(session) }}</p>
            </div>
          </div>
        </template>
        <template #address="{ row: session }">{{ session.ipAddress }}</template>
        <template #signedIn="{ row: session }">{{ session.signedInOn }}</template>
        <template #lastActive="{ row: session }">{{ session.lastActive }}</template>
        <template #actions="{ row: session }">
          <AppButton
            v-if="!session.current"
            size="sm"
            variant="ghost"
            :disabled="busy"
            @click="confirming = { kind: 'one', session }"
          >
            {{ messages.signOut }}
          </AppButton>
        </template>
        <template #empty>
          <p class="text-center text-xs text-muted">{{ messages.noSessions }}</p>
        </template>
      </AppDataTable>
    </SettingsSection>

    <SettingsSection>
      <template #title>{{ messages.recentSignIns }}</template>
      <template v-if="manage" #description>{{ messages.recentSignInsDescription }}</template>
      <AppDataTable :table="signInTable" :label="messages.recentSignIns" :loading="loading">
        <template #device="{ row: signIn }">
          <div class="flex min-w-0 items-center gap-3">
            <icon-lucide-log-in class="size-4 shrink-0 text-muted" />
            <div class="min-w-0">
              <p :class="ui.title()">{{ labels.device(signIn) }}</p>
              <p v-if="signedInWith(signIn)" :class="ui.detail()">{{ signedInWith(signIn) }}</p>
            </div>
          </div>
        </template>
        <template #address="{ row: signIn }">{{ signIn.ipAddress }}</template>
        <template #when="{ row: signIn }">{{ signIn.when }}</template>
        <template #empty>
          <p class="text-center text-xs text-muted">{{ messages.noSignIns }}</p>
        </template>
      </AppDataTable>
    </SettingsSection>

    <AppConfirmationDialog
      :open="confirming !== null"
      tone="danger"
      :heading="confirmation?.heading ?? ''"
      :description="confirmation?.description"
      :cancel-label="messages.cancel"
      :confirm-label="confirmation?.confirm ?? ''"
      @update:open="(open) => !open && (confirming = null)"
      @confirm="confirm"
    />
  </div>
</template>
