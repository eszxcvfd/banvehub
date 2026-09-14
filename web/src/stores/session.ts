import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { BackendError, signIn as requestSignIn } from '@/lib/daptin'

const TOKEN_KEY = 'daptin.token'
const EMAIL_KEY = 'daptin.email'

/**
 * Session state. The token is kept in `localStorage` so a reload does not sign
 * the operator out; that choice and its limits are recorded in
 * `docs/decisions/0004-web-session-and-api-access.md`.
 */
export const useSessionStore = defineStore('session', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const email = ref<string | null>(localStorage.getItem(EMAIL_KEY))
  const error = ref<string | null>(null)
  const hint = ref<string | null>(null)
  const pending = ref(false)

  const isAuthenticated = computed(() => token.value !== null)

  async function signIn(nextEmail: string, password: string) {
    pending.value = true
    error.value = null
    hint.value = null
    try {
      const nextToken = await requestSignIn(nextEmail, password)
      token.value = nextToken
      email.value = nextEmail
      localStorage.setItem(TOKEN_KEY, nextToken)
      localStorage.setItem(EMAIL_KEY, nextEmail)
    } catch (cause) {
      const backend = cause as BackendError
      error.value = backend.message || 'Sign in failed.'
      hint.value = backend.hint ?? null
      signOut()
    } finally {
      pending.value = false
    }
  }

  function signOut() {
    token.value = null
    email.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
  }

  return { token, email, error, hint, pending, isAuthenticated, signIn, signOut }
})
