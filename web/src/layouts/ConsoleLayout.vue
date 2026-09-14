<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { FieldInput, FieldLabel, FieldRoot } from '@ark-ui/vue/field'

import { useSchemaStore } from '@/stores/schema'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const schema = useSchemaStore()
const router = useRouter()

const filter = ref('')

watch(
  () => session.token,
  (token) => {
    if (token) void schema.load(token)
    else schema.reset()
  },
  { immediate: true },
)

const matches = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  if (!needle) return schema.entities
  return schema.entities.filter((entity) => entity.name.toLowerCase().includes(needle))
})

const primary = computed(() => matches.value.filter((entity) => entity.isTopLevel))
const supporting = computed(() => matches.value.filter((entity) => !entity.isTopLevel))

const backendState = computed(() => {
  if (schema.status === 'ready') return { label: 'backend ok', tone: 'text-allowed' }
  if (schema.status === 'error') {
    const suffix = schema.errorStatus ? ` ${schema.errorStatus}` : ''
    return { label: `backend denied${suffix}`, tone: 'text-ruling' }
  }
  if (schema.status === 'loading') return { label: 'reading schema', tone: 'text-slate' }
  return { label: 'not connected', tone: 'text-slate' }
})

function signOut() {
  session.signOut()
  schema.reset()
  void router.push({ name: 'signin' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-rule bg-surface">
      <div class="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-5 py-3">
        <h1 class="text-lg">daptin records</h1>
        <p class="text-sm text-slate">What the backend holds, and who may touch it.</p>

        <div class="ml-auto flex items-center gap-4">
          <span class="cell-data" :class="backendState.tone">{{ backendState.label }}</span>
          <span v-if="session.email" class="cell-data text-slate">{{ session.email }}</span>
          <button class="btn btn-quiet" type="button" @click="signOut">Sign out</button>
        </div>
      </div>
      <div class="h-0.5 bg-ruling" />
    </header>

    <div class="flex flex-1 flex-col lg:flex-row">
      <nav
        class="shrink-0 border-b border-rule bg-surface px-5 py-4 lg:w-64 lg:border-r lg:border-b-0"
        aria-label="Schema"
      >
        <h2 class="text-base">Schema</h2>
        <p class="mt-1 mb-3 text-xs text-slate">Every table this account can read.</p>

        <FieldRoot class="mb-4">
          <FieldLabel class="mb-1 block text-xs text-slate">Narrow the list</FieldLabel>
          <FieldInput v-model="filter" class="field-input" placeholder="products" />
        </FieldRoot>

        <p v-if="schema.status === 'loading'" class="text-sm text-slate">Reading…</p>

        <div v-if="primary.length" class="mb-4">
          <p class="mb-1 text-xs text-slate">Primary</p>
          <ul class="space-y-0.5">
            <li v-for="entity in primary" :key="entity.name">
              <RouterLink
                :to="{ name: 'records', params: { table: entity.name } }"
                class="flex items-baseline gap-2 py-0.5 text-sm"
                active-class="font-medium"
              >
                <span
                  class="mt-1 h-3 w-0.5 shrink-0 bg-ruling"
                  :class="
                    $route.name === 'records' && $route.params.table === entity.name
                      ? 'opacity-100'
                      : 'opacity-0'
                  "
                  aria-hidden="true"
                />
                <span class="cell-data">{{ entity.name }}</span>
              </RouterLink>
            </li>
          </ul>
        </div>

        <details v-if="supporting.length" class="text-sm">
          <summary class="cursor-pointer text-xs text-slate">
            Supporting tables ({{ supporting.length }})
          </summary>
          <ul class="mt-1 max-h-64 space-y-0.5 overflow-y-auto pr-1">
            <li v-for="entity in supporting" :key="entity.name">
              <RouterLink
                :to="{ name: 'records', params: { table: entity.name } }"
                class="cell-data text-xs"
              >
                {{ entity.name }}
              </RouterLink>
            </li>
          </ul>
        </details>
      </nav>

      <main class="min-w-0 flex-1 px-5 py-6 lg:px-8">
        <section v-if="schema.status === 'error'" class="max-w-2xl">
          <h2 class="text-xl">The schema could not be read</h2>
          <p class="mt-2 text-slate">{{ schema.error }}</p>
          <p v-if="schema.hint" class="mt-2 text-sm text-slate">{{ schema.hint }}</p>
          <button
            class="btn btn-primary mt-4"
            type="button"
            :disabled="!session.token"
            @click="session.token && schema.load(session.token)"
          >
            Try again
          </button>
        </section>

        <RouterView v-else />
      </main>
    </div>
  </div>
</template>
