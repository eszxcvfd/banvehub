'use client'

import type { Product } from '@/payload-types'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

/**
 * The storefront cart, kept in the buyer's browser session behind the same surface the storefront's
 * components already consume from the plugin's `useCart`
 * (`@payloadcms/plugin-ecommerce/client/react`) — decision 0014.
 *
 * The plugin's cart is backed by `/api/carts`, a route this repository does not have: phase 2
 * disabled the plugin's `carts` collection (`web/src/plugins/index.ts`) and decision 0013 removed the
 * commerce tables behind it. Rather than bringing a collection, a table or a migration back, this
 * store keeps the same cart shapes in `sessionStorage`, so `CartDrawer`, `CartPageClient`,
 * `OpenCartButton` and the checkout render and mutate a real cart without a server request.
 * `EcommerceProvider` stays mounted beside it, because the account area needs its `useAddresses` and
 * the checkout needs its `usePayments`.
 *
 * The surface is deliberately the one the components call today:
 *   - `cart` with `items` and `subtotal`, each item carrying `id`, `product` and `quantity`
 *   - `isLoading`
 *   - `addItem(item, quantity = 1)` — the shape the plugin's `addItem` takes
 *   - `removeItem`, `incrementItem`, `decrementItem`, all addressed by item id
 *   - `clearCart()`
 */

/** Session-scoped storage key; the cart never leaves the browser session. */
export const CART_SESSION_STORAGE_KEY = 'kientaohub_cart'

/** A product as the cart holds it: whatever the caller knows about it, plus its id. */
export type CartProductSnapshot = Partial<Product> & { id: number | string }

export type CartProduct = CartProductSnapshot | number | string

export type CartItem = {
  id: string
  product: CartProduct | null
  quantity: number
}

export type Cart = {
  items: CartItem[]
  subtotal: number
  currency: string
}

export type AddItemInput = {
  product: CartProduct
  variant?: unknown
  quantity?: number
}

export type CartContextValue = {
  cart: Cart | null
  isLoading: boolean
  addItem: (item: AddItemInput, quantity?: number) => Promise<void>
  removeItem: (itemId: string | number) => Promise<void>
  incrementItem: (itemId: string | number) => Promise<void>
  decrementItem: (itemId: string | number) => Promise<void>
  clearCart: () => Promise<void>
}

const CURRENCY = 'VND'

const noop = async () => {}

/**
 * Outside a `CartProvider` the hook answers like an empty session with no-op mutators — the same
 * default the plugin's context returns — so a component rendered in isolation (a story, a unit test)
 * still renders its empty state instead of throwing.
 */
const defaultCartContext: CartContextValue = {
  cart: null,
  isLoading: false,
  addItem: noop,
  removeItem: noop,
  incrementItem: noop,
  decrementItem: noop,
  clearCart: noop,
}

const CartContext = createContext<CartContextValue>(defaultCartContext)

const isBrowser = (): boolean => typeof window !== 'undefined' && Boolean(window.sessionStorage)

/** The item id the mutators address: stable per product, so a reload keeps the same identity. */
const itemIdFor = (product: CartProduct | null | undefined): string => {
  if (product === null || product === undefined) return 'unknown-item'
  if (typeof product === 'object') return String(product.id)
  return String(product)
}

const quantityOf = (value: unknown): number => {
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 1
}

const unitPriceOf = (product: CartItem['product']): number => {
  if (!product || typeof product !== 'object') return 0
  const price = Number(product.price)
  return Number.isFinite(price) && price > 0 ? price : 0
}

const subtotalOf = (items: CartItem[]): number =>
  items.reduce((total, item) => total + unitPriceOf(item.product) * item.quantity, 0)

/**
 * Read the session cart. Anything that is not a well-formed cart — missing, not JSON, not an object,
 * items that are not objects — degrades to an empty cart instead of throwing the page away.
 */
const readSessionCart = (): CartItem[] => {
  if (!isBrowser()) return []

  try {
    const raw = window.sessionStorage.getItem(CART_SESSION_STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    const stored = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : []

    return stored
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: typeof item.id === 'string' && item.id ? item.id : itemIdFor(item.product as CartProduct),
        product: (item.product ?? null) as CartProduct | null,
        quantity: quantityOf(item.quantity),
      }))
  } catch {
    return []
  }
}

const writeSessionCart = (items: CartItem[]): void => {
  if (!isBrowser()) return

  try {
    if (items.length === 0) {
      window.sessionStorage.removeItem(CART_SESSION_STORAGE_KEY)
      return
    }

    window.sessionStorage.setItem(CART_SESSION_STORAGE_KEY, JSON.stringify({ items }))
  } catch {
    // A full or blocked storage must not break the cart the buyer can still use in this page.
  }
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [pending, setPending] = useState(0)
  const mutatedBeforeHydration = useRef(false)

  // Read the session after mount, not during the first render: the server has no sessionStorage, so a
  // lazy initialiser would render a cart the server-rendered markup does not have (the header badge
  // is the visible one). Deferred through a microtask so the update is not a state write inside the
  // effect body, which is what `react-hooks/set-state-in-effect` forbids.
  useEffect(() => {
    queueMicrotask(() => {
      // A mutation that landed before this microtask (a click in the very first frame, or a caller
      // that seeds the cart as soon as it mounts) is newer than the session contents read at mount, so
      // it wins instead of being overwritten by them.
      if (!mutatedBeforeHydration.current) setItems(readSessionCart())
      setHydrated(true)
    })
  }, [])

  useEffect(() => {
    if (!hydrated) return
    writeSessionCart(items)
  }, [hydrated, items])

  const mutate = useCallback(async (change: (current: CartItem[]) => CartItem[]) => {
    mutatedBeforeHydration.current = true
    setPending((count) => count + 1)
    try {
      setItems(change)
    } finally {
      setPending((count) => count - 1)
    }
  }, [])

  const addItem = useCallback(
    async (item: AddItemInput, quantity = 1) => {
      const wanted = quantityOf(quantity)

      await mutate((current) => {
        const id = itemIdFor(item.product)
        const existing = current.find((entry) => entry.id === id)

        if (existing) {
          return current.map((entry) =>
            entry.id === id ? { ...entry, quantity: entry.quantity + wanted } : entry,
          )
        }

        return [...current, { id, product: item.product, quantity: wanted }]
      })
    },
    [mutate],
  )

  const removeItem = useCallback(
    async (itemId: string | number) => {
      const id = String(itemId)
      await mutate((current) => current.filter((entry) => entry.id !== id))
    },
    [mutate],
  )

  const incrementItem = useCallback(
    async (itemId: string | number) => {
      const id = String(itemId)
      await mutate((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, quantity: entry.quantity + 1 } : entry)),
      )
    },
    [mutate],
  )

  const decrementItem = useCallback(
    async (itemId: string | number) => {
      const id = String(itemId)
      await mutate((current) =>
        current.map((entry) =>
          // The cart holds one line per product; the last unit stays (the steppers disable the
          // decrement at quantity 1 anyway), and removal is the explicit control.
          entry.id === id ? { ...entry, quantity: Math.max(1, entry.quantity - 1) } : entry,
        ),
      )
    },
    [mutate],
  )

  const clearCart = useCallback(async () => {
    await mutate(() => [])
  }, [mutate])

  const cart = useMemo<Cart | null>(
    () => (items.length === 0 ? null : { items, subtotal: subtotalOf(items), currency: CURRENCY }),
    [items],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      isLoading: pending > 0,
      addItem,
      removeItem,
      incrementItem,
      decrementItem,
      clearCart,
    }),
    [cart, pending, addItem, removeItem, incrementItem, decrementItem, clearCart],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = (): CartContextValue => useContext(CartContext)
