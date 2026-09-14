<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FieldInput, FieldLabel, FieldRoot } from '@ark-ui/vue/field'

import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const email = ref(session.email ?? '')
const password = ref('')
const origin = typeof window === 'undefined' ? '' : window.location.origin

async function submit() {
  await session.signIn(email.value.trim(), password.value)
  if (!session.isAuthenticated) return
  const next = typeof route.query.next === 'string' ? route.query.next : '/'
  await router.push(next)
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
    <h1 class="text-2xl">Sign in to daptin records</h1>
    <p class="mt-2 max-w-prose text-slate">
      This console reads the tables and records of the local daptin backend and shows what this
      account is allowed to do with them. Accounts live in the backend; the administrator is created
      when it is first provisioned.
    </p>

    <form class="mt-8 space-y-4" @submit.prevent="submit">
      <FieldRoot required>
        <FieldLabel class="mb-1 block text-xs text-slate">Email</FieldLabel>
        <FieldInput
          v-model="email"
          class="field-input"
          type="email"
          autocomplete="username"
          required
        />
      </FieldRoot>

      <FieldRoot required>
        <FieldLabel class="mb-1 block text-xs text-slate">Password</FieldLabel>
        <FieldInput
          v-model="password"
          class="field-input"
          type="password"
          autocomplete="current-password"
          required
        />
      </FieldRoot>

      <div class="flex items-center gap-3 pt-2">
        <button class="btn btn-primary" type="submit" :disabled="session.pending">
          {{ session.pending ? 'Signing in…' : 'Sign in' }}
        </button>
        <span class="cell-data text-slate">{{ origin }}</span>
      </div>
    </form>

    <p v-if="session.error" class="mt-4 text-sm text-ruling" role="alert">
      {{ session.error }}
    </p>
    <p v-if="session.hint" class="mt-1 text-sm text-slate">{{ session.hint }}</p>
  </div>
</template>
