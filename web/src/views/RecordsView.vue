<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from '@ark-ui/vue/pagination'

import LedgerTable from '@/components/LedgerTable.vue'
import NewRecordDialog from '@/components/NewRecordDialog.vue'
import {
  BackendError,
  createRecord,
  deleteRecord,
  loadRecords,
  type RecordPage,
} from '@/lib/daptin'
import { useSchemaStore } from '@/stores/schema'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ table: string }>()

const session = useSessionStore()
const schema = useSchemaStore()

const PAGE_SIZE = 25

const page = ref(1)
const data = ref<RecordPage>({ rows: [], total: 0, lastPage: 1 })
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const errorStatus = ref(0)
const error = ref<string | null>(null)
const hint = ref<string | null>(null)

const createPending = ref(false)
const createError = ref<string | null>(null)
const pendingDeleteId = ref<string | null>(null)
const actionError = ref<string | null>(null)

const entity = computed(() => schema.entity(props.table))
const hasRows = computed(() => data.value.rows.length > 0)

async function load() {
  if (!session.token) return
  status.value = 'loading'
  error.value = null
  hint.value = null
  errorStatus.value = 0
  try {
    data.value = await loadRecords(session.token, props.table, { page: page.value, size: PAGE_SIZE })
    status.value = 'ready'
  } catch (cause) {
    const backend = cause as BackendError
    errorStatus.value = backend.status
    error.value = backend.message
    hint.value = backend.hint ?? null
    status.value = 'error'
  }
}

watch(
  () => props.table,
  () => {
    page.value = 1
    pendingDeleteId.value = null
    actionError.value = null
    createError.value = null
    void load()
  },
  { immediate: true },
)

watch(page, () => void load())

async function submitRecord(attributes: Record<string, unknown>) {
  if (!session.token) return
  createPending.value = true
  createError.value = null
  try {
    await createRecord(session.token, props.table, attributes)
    page.value = 1
    await load()
  } catch (cause) {
    createError.value = (cause as BackendError).message
  } finally {
    createPending.value = false
  }
}

async function confirmDelete(id: string) {
  if (!session.token) return
  actionError.value = null
  try {
    await deleteRecord(session.token, props.table, id)
    pendingDeleteId.value = null
    await load()
  } catch (cause) {
    actionError.value = (cause as BackendError).message
  }
}

</script>

<template>
  <div class="max-w-5xl">
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <h2 class="text-xl">{{ table }}</h2>
      <p class="cell-data text-xs text-slate">/api/{{ table }}</p>
      <p v-if="status === 'ready'" class="text-sm text-slate">
        {{ data.total }} {{ data.total === 1 ? 'record' : 'records' }} in this table.
      </p>
      <div class="ml-auto">
        <NewRecordDialog
          v-if="entity"
          :entity="entity"
          :pending="createPending"
          :error="createError"
          @submit="submitRecord"
          @closed="createError = null"
        />
      </div>
    </div>

    <p v-if="!entity && schema.status === 'ready'" class="mt-4 text-slate">
      The backend does not expose a table named “{{ table }}”. It may have been renamed or removed
      from the schema.
    </p>

    <div v-if="status === 'loading'" class="mt-6 space-y-2" aria-live="polite">
      <p class="text-sm text-slate">Reading records…</p>
      <div v-for="line in 3" :key="line" class="h-px w-full bg-rule" />
    </div>

    <section v-else-if="status === 'error'" class="mt-6 max-w-2xl">
      <h3 class="text-lg">
        {{ errorStatus === 403 ? 'This account cannot read this table' : 'The records could not be read' }}
      </h3>
      <p class="mt-2 text-slate">{{ error }}</p>
      <p v-if="hint" class="mt-2 text-sm text-slate">{{ hint }}</p>
      <button
        class="btn btn-quiet mt-4"
        type="button"
        @click="load"
      >
        Try again
      </button>
    </section>

    <template v-else-if="entity">
      <div v-if="hasRows" class="mt-6">
        <LedgerTable :entity="entity" :rows="data.rows" :busy-id="pendingDeleteId" @delete="pendingDeleteId = $event" />
      </div>

      <div v-else class="mt-6 border-t border-rule pt-4">
        <p class="text-slate">
          No records in {{ table }} yet. Add the first one to give this table something to show.
        </p>
      </div>

      <div
        v-if="pendingDeleteId"
        class="mt-4 flex flex-wrap items-center gap-3 border-l-2 border-ruling bg-surface px-3 py-2"
        role="alertdialog"
        aria-label="Confirm delete"
      >
        <span class="text-sm">Delete record {{ pendingDeleteId }}? This cannot be undone.</span>
        <button class="btn btn-primary" type="button" @click="confirmDelete(pendingDeleteId)">
          Delete
        </button>
        <button class="btn btn-quiet" type="button" @click="pendingDeleteId = null">Keep</button>
      </div>

      <PaginationRoot
        v-if="data.lastPage > 1"
        v-model:page="page"
        :count="data.lastPage"
        :page-size="1"
        class="mt-6 flex items-center gap-2"
      >
        <PaginationPrevTrigger class="btn btn-quiet">Previous</PaginationPrevTrigger>
        <span class="cell-data text-xs text-slate">page {{ page }} of {{ data.lastPage }}</span>
        <PaginationNextTrigger class="btn btn-quiet">Next</PaginationNextTrigger>
      </PaginationRoot>
    </template>

    <p v-if="actionError" class="mt-3 text-sm text-ruling" role="alert">{{ actionError }}</p>
  </div>
</template>
