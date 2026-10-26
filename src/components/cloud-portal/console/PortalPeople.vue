<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'
import { computed } from 'vue'

import type { CloudAdminUserFilter } from '@open-pencil/cloud/contract'
import { useCloudPortalMessages } from '@open-pencil/vue/i18n'

import {
  usePortalList,
  type PortalTableFeatures,
  type PortalListPage,
  type PortalListRequest
} from '@/app/cloud-portal/list'
import AccountAvatar from '@/components/presence/AccountAvatar.vue'
import { portalList } from '@/theme/cloud-portal/list'

import type { PortalPerson, PortalPersonAction } from '../types'
import PortalPersonActions from './PortalPersonActions.vue'
import PortalTable from './PortalTable.vue'

/**
 * Everyone with an account on the server, a page at a time: filtered by what they are, searched
 * by name or email, each with what an administrator can do about them.
 */
const { load, busy = false } = defineProps<{
  load: (
    request: PortalListRequest<CloudAdminUserFilter>
  ) => Promise<PortalListPage<CloudAdminUserFilter, PortalPerson>>
  busy?: boolean
}>()
const emit = defineEmits<{
  act: [person: PortalPerson, action: PortalPersonAction, reason?: string]
  open: [personId: string]
}>()

const ui = portalList()
const messages = useCloudPortalMessages()
const column = createColumnHelper<PortalTableFeatures, PortalPerson>()
const people = usePortalList<CloudAdminUserFilter, PortalPerson>({
  filter: 'all',
  load: (request) => load(request),
  rowId: (person) => person.id,
  columns: [
    column.display({ id: 'person', header: () => messages.value.columnPerson }),
    column.display({
      id: 'role',
      header: () => messages.value.columnRole,
      meta: { class: 'hidden max-w-56 @md/data-table:table-cell' }
    }),
    column.display({
      id: 'workspaces',
      header: () => messages.value.columnWorkspaces,
      meta: { class: 'hidden w-24 text-right tabular-nums @2xl/data-table:table-cell' }
    }),
    column.display({
      id: 'lastActive',
      header: () => messages.value.columnLastActive,
      meta: { class: 'hidden w-32 whitespace-nowrap text-muted @xl/data-table:table-cell' }
    }),
    column.display({
      id: 'joined',
      header: () => messages.value.columnJoined,
      meta: { class: 'hidden w-28 whitespace-nowrap text-muted @3xl/data-table:table-cell' }
    }),
    column.display({
      id: 'actions',
      header: () => messages.value.columnActions,
      meta: { class: 'w-px text-right', headerHidden: true }
    })
  ]
})
const filters = computed(() => [
  { value: 'all' as const, label: messages.value.filterEveryone },
  { value: 'administrators' as const, label: messages.value.filterAdministrators },
  { value: 'suspended' as const, label: messages.value.filterSuspended },
  { value: 'without-two-step' as const, label: messages.value.filterWithoutTwoStep }
])

defineExpose({ reload: people.reload })
</script>

<template>
  <PortalTable
    :list="people"
    :label="messages.people"
    :search-label="messages.searchPeople"
    :filters="filters"
    :empty-label="messages.noPeopleFound"
    :empty-description="messages.noPeopleFoundDescription"
  >
    <template #icon><icon-lucide-users class="size-5" /></template>
    <template #person="{ row: person }">
      <div class="flex min-w-0 items-center gap-3">
        <AccountAvatar :id="person.id" :name="person.name" :image="person.image" size="md" />
        <button
          type="button"
          class="min-w-0 rounded text-left focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
          @click="emit('open', person.id)"
        >
          <span :class="ui.title()">
            <span class="truncate">{{ person.name }}</span>
            <span v-if="person.you" class="shrink-0 font-normal text-muted">{{
              messages.you
            }}</span>
          </span>
          <span :class="[ui.detail(), 'block']">{{ person.email }}</span>
        </button>
      </div>
    </template>
    <template #role="{ row: person }">
      <div class="flex flex-wrap items-center gap-1">
        <span v-if="person.admin" :class="ui.status()" data-tone="neutral">
          {{ messages.administrator }}
        </span>
        <span v-if="person.suspended" :class="ui.status()" data-tone="error">
          {{ messages.suspended }}
        </span>
        <span v-else-if="person.admin && !person.twoStep" :class="ui.status()" data-tone="warning">
          {{ messages.twoStepOff }}
        </span>
        <span v-if="!person.admin && !person.suspended" class="text-muted">
          {{ messages.member }}
        </span>
      </div>
      <!-- The badge says it is suspended; the line under it says why. -->
      <p v-if="person.suspendedReason" :class="ui.detail()">{{ person.suspendedReason }}</p>
    </template>
    <template #workspaces="{ row: person }">{{ person.workspaceCount }}</template>
    <template #lastActive="{ row: person }">
      {{ person.lastActive ?? messages.notSignedIn }}
    </template>
    <template #joined="{ row: person }">{{ person.joinedOn }}</template>
    <template #actions="{ row: person }">
      <PortalPersonActions
        :person="person"
        :disabled="busy"
        @act="(action, reason) => emit('act', person, action, reason)"
      />
    </template>
  </PortalTable>
</template>
