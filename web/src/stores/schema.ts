import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { BackendError, loadEntities, type Entity } from '@/lib/daptin'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * The backend's own schema is the navigation, so the entity list is read from
 * `/api/world` rather than declared in the app.
 */
export const useSchemaStore = defineStore('schema', () => {
  const entities = ref<Entity[]>([])
  const status = ref<LoadStatus>('idle')
  const errorStatus = ref(0)
  const error = ref<string | null>(null)
  const hint = ref<string | null>(null)

  const byName = computed(() => new Map(entities.value.map((entity) => [entity.name, entity])))
  const topLevel = computed(() => entities.value.filter((entity) => entity.isTopLevel))

  async function load(token: string) {
    status.value = 'loading'
    error.value = null
    hint.value = null
    errorStatus.value = 0
    try {
      entities.value = await loadEntities(token)
      status.value = 'ready'
    } catch (cause) {
      const backend = cause as BackendError
      errorStatus.value = backend.status
      error.value = backend.message
      hint.value = backend.hint ?? null
      status.value = 'error'
    }
  }

  function reset() {
    entities.value = []
    status.value = 'idle'
    errorStatus.value = 0
    error.value = null
    hint.value = null
  }

  function entity(name: string): Entity | null {
    return byName.value.get(name) ?? null
  }

  return { entities, status, errorStatus, error, hint, topLevel, load, reset, entity }
})
