<script setup lang="ts">
import { computed } from 'vue'

import { isNumeric, type Column, type Entity, type RecordRow } from '@/lib/daptin'

const props = defineProps<{
  entity: Entity
  rows: RecordRow[]
  busyId?: string | null
}>()

const emit = defineEmits<{ delete: [id: string]; keep: [] }>()

/**
 * A record's own columns are the table's columns, minus the bookkeeping ones
 * this console does not edit, with `created_at` kept as provenance.
 */
const columns = computed<Column[]>(() => {
  const hidden = new Set(['version', 'permission', 'user_account_id', 'reference_id'])
  return props.entity.columns.filter((column) => !hidden.has(column.name)).slice(0, 7)
})

defineExpose({ columns })

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function isReferenceColumn(column: Column): boolean {
  return column.name === 'id' || column.name.endsWith('_id') || column.name === 'reference_id'
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full border-collapse text-left">
      <caption class="sr-only">
        Records in {{ entity.name }}
      </caption>
      <thead>
        <tr class="border-b border-ink/60">
          <th
            v-for="column in columns"
            :key="column.name"
            scope="col"
            class="cell-data py-2 pr-6 font-medium"
            :class="isNumeric(column) ? 'text-right' : 'text-left'"
          >
            {{ column.name }}
          </th>
          <th scope="col" class="py-2 text-right text-xs font-normal text-slate">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" class="ledger-row">
          <td
            v-for="column in columns"
            :key="column.name"
            class="py-2 pr-6 align-top"
            :class="[
              isNumeric(column) ? 'cell-data text-right' : 'cell-data',
              isReferenceColumn(column) ? 'text-slate' : '',
            ]"
          >
            <span class="inline-block max-w-[26rem] truncate" :title="display(row.attributes[column.name])">
              {{ display(row.attributes[column.name]) }}
            </span>
          </td>
          <td class="py-2 text-right align-top">
            <button
              class="text-xs text-slate underline decoration-rule underline-offset-2 hover:text-ruling"
              type="button"
              :disabled="busyId === row.id"
              @click="emit('delete', row.id)"
            >
              Delete
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
