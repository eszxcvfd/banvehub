<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogDescription,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '@ark-ui/vue/dialog'
import { FieldInput, FieldLabel, FieldRoot } from '@ark-ui/vue/field'

import { editableColumns, isNumeric, isRequired, type Entity } from '@/lib/daptin'

const props = defineProps<{
  entity: Entity
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{ submit: [attributes: Record<string, unknown>]; closed: [] }>()

const open = ref(false)
const values = ref<Record<string, string | boolean>>({})

const fields = computed(() => editableColumns(props.entity))

watch(open, (isOpen) => {
  if (isOpen) {
    const next: Record<string, string | boolean> = {}
    for (const field of fields.value) next[field.name] = field.type === 'boolean' ? false : ''
    values.value = next
  } else {
    emit('closed')
  }
})

// The parent owns the request; a settled submit without an error means the
// record exists, so the dialog closes itself.
watch(
  [() => props.pending, () => props.error],
  ([pending, error], [wasPending]) => {
    if (wasPending && !pending && !error) open.value = false
  },
)

function submit() {
  const attributes: Record<string, unknown> = {}
  for (const field of fields.value) {
    const value = values.value[field.name]
    if (field.type === 'boolean') {
      attributes[field.name] = value === true
      continue
    }
    const text = String(value ?? '').trim()
    if (text === '') continue
    attributes[field.name] = isNumeric(field) ? Number(text) : text
  }
  emit('submit', attributes)
}

// The parent closes the dialog by flipping this prop through `closed`.
function close() {
  open.value = false
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger class="btn btn-primary">Add a record</DialogTrigger>
    <DialogBackdrop class="fixed inset-0 bg-ink/25" />
    <DialogPositioner class="fixed inset-0 flex items-start justify-center overflow-y-auto p-6">
      <DialogContent class="w-full max-w-lg border border-ink/30 bg-paper p-5">
        <DialogTitle class="text-lg">Add a record to {{ entity.name }}</DialogTitle>
        <DialogDescription class="mt-1 text-sm text-slate">
          Only the columns this console can write are shown. Relations and bookkeeping columns are
          set by the backend.
        </DialogDescription>

        <form class="mt-4 space-y-3" @submit.prevent="submit">
          <FieldRoot v-for="field in fields" :key="field.name" :required="isRequired(field)">
            <FieldLabel class="mb-1 block text-xs text-slate">
              {{ field.name }}
              <span v-if="isRequired(field)" class="text-ruling" aria-hidden="true">*</span>
            </FieldLabel>

            <input
              v-if="field.type === 'boolean'"
              v-model="values[field.name]"
              type="checkbox"
              class="h-4 w-4 accent-ink"
            />
            <FieldInput
              v-else
              v-model="values[field.name] as string"
              class="field-input"
              :type="isNumeric(field) ? 'number' : 'text'"
              :data-type="field.dataType"
            />
          </FieldRoot>

          <p v-if="!fields.length" class="text-sm text-slate">
            This table has no columns this console can write. Add records through the daptin
            dashboard or a schema change.
          </p>

          <p v-if="error" class="text-sm text-ruling" role="alert">{{ error }}</p>

          <div class="flex items-center gap-2 pt-1">
            <button class="btn btn-primary" type="submit" :disabled="pending || !fields.length">
              {{ pending ? 'Saving…' : 'Add record' }}
            </button>
            <button class="btn btn-quiet" type="button" :disabled="pending" @click="close">
              Cancel
            </button>
          </div>
        </form>

        <DialogCloseTrigger
          class="absolute top-3 right-4 text-slate hover:text-ink"
          aria-label="Close"
        >
          ×
        </DialogCloseTrigger>
      </DialogContent>
    </DialogPositioner>
  </DialogRoot>
</template>
