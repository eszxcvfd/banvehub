'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from 'antd'
import { ShoppingCartOutlined } from '@ant-design/icons'
import { useCart } from '@/providers/Cart'
import { CartDrawer, OPEN_CART_EVENT } from './CartDrawer'

export function OpenCartButton({
  className,
  quantity: propQuantity,
}: {
  className?: string
  quantity?: number
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { cart } = useCart()
  const totalItems =
    propQuantity !== undefined
      ? propQuantity
      : cart?.items?.reduce(
          (total: number, item: { quantity?: number | null }) => total + (item?.quantity || 1),
          0,
        ) || 0

  // This instance owns the drawer the header renders, and it renders it **controlled**: the drawer's
  // own listener for `open-cart-drawer` (fired by the product page's "Thêm vào giỏ hàng") only moves an
  // *uncontrolled* instance's internal state, so the click that added the item mounted no drawer at
  // all (measured: 0 drawers in the browser and in jsdom). Opening this instance here is what makes
  // that event reach the cart the application renders.
  useEffect(() => {
    const handleOpen = () => setDrawerOpen(true)
    window.addEventListener(OPEN_CART_EVENT, handleOpen)
    return () => window.removeEventListener(OPEN_CART_EVENT, handleOpen)
  }, [])

  return (
    <>
      <Link
        href="/cart"
        onClick={(e) => {
          e.preventDefault()
          setDrawerOpen(true)
        }}
        aria-label="Giỏ hàng"
        data-slot="cart"
        className={
          className ||
          'inline-flex items-center justify-center p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:text-[#1677ff] transition-colors cursor-pointer'
        }
      >
        <Badge count={totalItems} overflowCount={99} size="small" offset={[2, -2]}>
          <ShoppingCartOutlined style={{ fontSize: 20 }} />
        </Badge>
      </Link>
      <CartDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
