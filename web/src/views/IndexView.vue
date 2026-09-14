<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { editableColumns } from '@/lib/daptin'
import { useSchemaStore } from '@/stores/schema'

const schema = useSchemaStore()

const primary = computed(() => schema.topLevel)

function writableFields(table: string): string {
  const entity = schema.entity(table)
  if (!entity) return ''
  const names = editableColumns(entity).map((column) => column.name)
  return names.length ? names.join(', ') : 'read-only in this console'
}
</script>

<template>
  <div class="max-w-4xl">
    <h2 class="text-xl">Index</h2>
    <p class="mt-1 text-slate">
      {{ schema.entities.length }} tables, {{ primary.length }} of them primary. The schema comes
      from the backend, so this list changes when the schema does.
    </p>

    <table v-if="primary.length" class="mt-6 w-full border-collapse text-left">
      <caption class="sr-only">
        Primary tables
      </caption>
      <thead>
        <tr class="border-b border-ink/60">
          <th scope="col" class="cell-data py-2 pr-6 font-medium">table</th>
          <th scope="col" class="cell-data py-2 pr-6 font-medium">columns</th>
          <th scope="col" class="cell-data py-2 pr-6 font-medium">writable here</th>
          <th scope="col" class="py-2 text-right text-xs font-normal text-slate">Records</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entity in primary" :key="entity.name" class="ledger-row">
          <td class="cell-data py-2 pr-6 align-top">{{ entity.name }}</td>
          <td class="cell-data py-2 pr-6 align-top text-slate">{{ entity.columns.length }}</td>
          <td class="cell-data py-2 pr-6 align-top text-slate">{{ writableFields(entity.name) }}</td>
          <td class="py-2 text-right align-top">
            <RouterLink
              :to="{ name: 'records', params: { table: entity.name } }"
              class="text-xs underline decoration-rule underline-offset-2 hover:text-ink"
            >
              Read records
            </RouterLink>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="mt-6 border-t border-rule pt-4">
      <p class="text-slate">
        No primary tables yet. A table becomes primary with <code class="cell-data">IsTopLevel:
        true</code> in a schema file under <code class="cell-data">daptin/schema/</code>, applied
        with <code class="cell-data">docker compose restart daptin</code>.
      </p>
    </div>
  </div>
</template>
