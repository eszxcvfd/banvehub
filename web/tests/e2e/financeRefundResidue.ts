import type { Payload } from 'payload'

/**
 * Residue sweep for the finance refund console spec.
 *
 * Why this exists: a run killed mid-flight (the machine OOM-kills Chromium whenever several suites
 * run at once) never executes `afterAll`, so its fixtures survive. They were real: five
 * `ORD-E2E-REF-*` orders had to be deleted by hand from the development database before the next
 * run could see a clean slate. The seed side got the same treatment in the fixture helper; this is
 * the e2e counterpart, and it runs in BOTH hooks so a previous killed run heals itself:
 *
 *   - `beforeAll` sweeps first, so residue from an earlier run is gone before this run seeds;
 *   - `afterAll` sweeps again, so the ordinary exit path leaves nothing behind either.
 *
 * The sweep is strictly namespaced: only rows this spec mints are touched — orders whose code
 * starts with `ORD-E2E-REF-`, the products whose slug starts with `refund-console-`, and the
 * dependents of those orders. No fixture identity another suite owns is read or written.
 *
 * Deletion order is dependency order, and it is NOT the order one would guess from the collection
 * list — it is what the database actually allows, measured for this increment:
 *
 *   refunds → seller_earnings → order_items → orders, products last
 *
 * `refunds.order_item_id` and `seller_earnings.order_item_id` are both NOT NULL while their foreign
 * keys are ON DELETE SET NULL, so deleting an order item while either row exists FAILS with a
 * constraint violation (the SET NULL action cannot write NULL into a NOT NULL column). Deleting the
 * refund and the earning first is therefore mandatory; deleting the item before the earning — the
 * intuitive order — silently leaves the item to be removed by the order's ON DELETE CASCADE, which
 * is why the sweep counts what it actually removed instead of assuming.
 *
 * The two wallet-bound buyer accounts (`refund-console-buyer@…`, and the earlier
 * `e2e-refund-buyer@…`) are DELIBERATELY NOT swept. Crediting a wallet is what a refund does, and
 * BR-03's `forbid_wallet_delete` trigger plus the NOT NULL `wallets.user_id` column make such an
 * account undeletable — a sweep that tried would turn a known, harmless residue into a hard failure
 * of every later run. The spec's fixture note says the same thing in prose.
 */

/** Prefix the spec mints for its orders (`seedOrder`). */
export const REFUND_CONSOLE_ORDER_CODE_PREFIX = 'ORD-E2E-REF-'

/** Prefix the spec mints for its product (`beforeAll`). */
export const REFUND_CONSOLE_PRODUCT_SLUG_PREFIX = 'refund-console-'

/** Domain the spec's own accounts live in (documented, never swept — see the note above). */
export const REFUND_CONSOLE_ACCOUNT_DOMAIN = 'kientaohub-refund.test'

export interface ResidueSweepResult {
  refunds: number
  orderItems: number
  sellerEarnings: number
  orders: number
  products: number
}

/**
 * Collections that reference an order, in the order the database permits removing them (see the
 * module note: refunds and earnings hold a NOT NULL foreign key to the item).
 */
const ORDER_DEPENDENTS = ['refunds', 'seller_earnings', 'order_items'] as const

/** One pass over this spec's namespace. Returns what it actually deleted. */
async function sweepOnce(payload: Payload): Promise<ResidueSweepResult> {
  const removed: ResidueSweepResult = {
    refunds: 0,
    orderItems: 0,
    sellerEarnings: 0,
    orders: 0,
    products: 0,
  }

  const orders = await payload.find({
    collection: 'orders',
    where: { code: { like: `${REFUND_CONSOLE_ORDER_CODE_PREFIX}%` } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  for (const order of orders.docs) {
    // The prefix check is repeated here on purpose: the query narrows the set, this guarantees the
    // set, so a query-operator surprise can never widen a destructive sweep.
    if (!String(order.code ?? '').startsWith(REFUND_CONSOLE_ORDER_CODE_PREFIX)) continue

    for (const collection of ORDER_DEPENDENTS) {
      const dependents = await payload.find({
        collection: collection as 'refunds',
        where: { order: { equals: order.id } },
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })

      for (const dependent of dependents.docs) {
        try {
          await payload.delete({
            collection: collection as 'refunds',
            id: dependent.id,
            overrideAccess: true,
          })
          if (collection === 'refunds') removed.refunds += 1
          else if (collection === 'order_items') removed.orderItems += 1
          else removed.sellerEarnings += 1
        } catch (error) {
          // Left for the next pass rather than failing the run. Reported, never swallowed: a silent
          // catch here is what hid the fact that the order item is freed only once the earning that
          // references it is gone.
          console.warn(
            `[finance-refund residue] could not delete ${collection} row ${String(dependent.id)}: ${
              error instanceof Error ? error.message.split('\n')[0] : String(error)
            }`,
          )
        }
      }
    }

    try {
      await payload.delete({ collection: 'orders', id: order.id, overrideAccess: true })
      removed.orders += 1
    } catch (error) {
      console.warn(
        `[finance-refund residue] could not delete order ${String(order.code)}: ${
          error instanceof Error ? error.message.split('\n')[0] : String(error)
        }`,
      )
    }
  }

  const products = await payload.find({
    collection: 'products',
    where: { slug: { like: `${REFUND_CONSOLE_PRODUCT_SLUG_PREFIX}%` } },
    limit: 0,
    pagination: false,
    depth: 0,
    draft: true,
    overrideAccess: true,
  })

  for (const product of products.docs) {
    if (!String(product.slug ?? '').startsWith(REFUND_CONSOLE_PRODUCT_SLUG_PREFIX)) continue

    try {
      await payload.delete({ collection: 'products', id: product.id, overrideAccess: true })
      removed.products += 1
    } catch (error) {
      console.warn(
        `[finance-refund residue] could not delete product ${String(product.slug)}: ${
          error instanceof Error ? error.message.split('\n')[0] : String(error)
        }`,
      )
    }
  }

  return removed
}

/**
 * Deletes this spec's own residue. Two bounded passes: a normal fixture set clears in one, and a
 * second pass lets a row that a concurrent process held on the first attempt heal in the same call
 * instead of waiting for the next run. Individual delete failures are tolerated and reported, so
 * hygiene can never fail a run; the returned counts report what was actually removed.
 */
export async function sweepFinanceRefundResidue(
  payload: Payload,
): Promise<ResidueSweepResult> {
  const total: ResidueSweepResult = {
    refunds: 0,
    orderItems: 0,
    sellerEarnings: 0,
    orders: 0,
    products: 0,
  }

  for (let pass = 0; pass < 2; pass++) {
    const removed = await sweepOnce(payload)
    total.refunds += removed.refunds
    total.orderItems += removed.orderItems
    total.sellerEarnings += removed.sellerEarnings
    total.orders += removed.orders
    total.products += removed.products

    if (removed.orders === 0 && removed.products === 0) break
  }

  return total
}
