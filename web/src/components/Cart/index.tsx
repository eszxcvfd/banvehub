import React from 'react'
import type { Product } from '@/payload-types'

export type CartItem = {
  id?: string | null
  product?: number | Product | null
  quantity?: number
  variant?: unknown
}

export function Cart() {
  return null
}
