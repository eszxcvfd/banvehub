import { expect, test, type Page } from '@playwright/test'
import type { Payload } from 'payload'
import { TEST_USERS, getTestPayload } from '../helpers/seedCatalog'
import { sweepFinanceRefundResidue } from './financeRefundResidue'

/**
 * Decision 0012 in the operator console: the refund action states the fault basis that decides who
 * bears the cost (§7) and, for an order older than 5 days from `orders.paidAt` (§6), an explicit
 * out-of-window override — driven end to end through the real UI and the real
 * `/api/v1/admin/refunds` route, never against a stub.
 *
 * Fixture note: this spec owns every account it needs — a wallet-bound buyer, a seller and the
 * financeAdmin operator — under the distinct `refund-console-*@kientaohub-refund.test` domain, so a
 * concurrent run of the suite (whose teardown deletes the shared `e2e-*@kientaohub.test` fixtures)
 * cannot pull users out from under it, and this spec never mutates a fixture identity. Crediting a
 * wallet is what makes a user undeletable (`wallets.user_id` is NOT NULL and the BR-03 trigger
 * forbids deleting the row), so the refunded buyer is documented and expected to survive; the
 * seller, operator, orders, order items, earnings, refunds and the product are deleted again.
 */

const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

const REFUND_BUYER_EMAIL = 'refund-console-buyer@kientaohub-refund.test'
const REFUND_SELLER_EMAIL = 'refund-console-seller@kientaohub-refund.test'
const REFUND_OPERATOR_EMAIL = 'refund-console-operator@kientaohub-refund.test'
const REFUND_WINDOW_DAYS = 5

const SALE_PRICE = 150000
const PLATFORM_FEE = 45000
const SELLER_AMOUNT = SALE_PRICE - PLATFORM_FEE

const DAY_MS = 24 * 60 * 60 * 1000

interface SeededOrder {
  orderId: number
  orderCode: string
  orderItemId: number
  earningId: number
}

test.describe('Decision 0012: the finance console refund action', () => {
  let payload: Payload
  let buyerId: number
  let productId: number
  let sellerId: number
  let productSlug: string
  let operatorEmail = REFUND_OPERATOR_EMAIL
  const seeded: SeededOrder[] = []

  const findOrCreateRefundBuyer = async (): Promise<number> => {
    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: REFUND_BUYER_EMAIL } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) return Number(existing.docs[0].id)

    const created = await payload.create({
      collection: 'users',
      data: {
        email: REFUND_BUYER_EMAIL,
        password: TEST_USERS.buyer.password,
        name: 'E2E Refund Buyer',
        roles: ['buyer'],
      },
      overrideAccess: true,
    })
    return Number(created.id)
  }

  /**
   * A seller account this spec owns. It deliberately does NOT borrow the suite's fixture seller: the
   * fixtures are deleted by the suite's own teardown (and by any concurrent run of the suite), and
   * `products.seller` is ON DELETE SET NULL, so a borrowed seller can vanish mid-run and the
   * OrderItems hook then refuses every order item with "has no assigned seller".
   */
  const findOrCreateRefundSeller = async (): Promise<number> => {
    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: REFUND_SELLER_EMAIL } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) return Number(existing.docs[0].id)

    const created = await payload.create({
      collection: 'users',
      data: {
        email: REFUND_SELLER_EMAIL,
        password: TEST_USERS.seller.password,
        name: 'E2E Refund Seller',
        roles: ['seller'],
      },
      overrideAccess: true,
    })
    return Number(created.id)
  }

  /**
   * The operator this spec signs in as. It also owns its own account rather than borrowing the
   * suite's fixture admin: a concurrent run of the suite deletes the four fixture accounts, and a
   * login that races that teardown fails with a redirect back to /login.
   */
  const findOrCreateRefundOperator = async (): Promise<void> => {
    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: REFUND_OPERATOR_EMAIL } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      operatorEmail = REFUND_OPERATOR_EMAIL
      return
    }

    await payload.create({
      collection: 'users',
      data: {
        email: REFUND_OPERATOR_EMAIL,
        password: TEST_USERS.admin.password,
        name: 'E2E Refund Operator',
        roles: ['financeAdmin'],
      },
      overrideAccess: true,
    })
    operatorEmail = REFUND_OPERATOR_EMAIL
  }

  /** A completed order with its snapshot line item and the PENDING seller earning it produced. */
  const seedOrder = async (
    paidAt: Date,
    label: string,
    status: 'COMPLETED' | 'CANCELLED' = 'COMPLETED',
  ): Promise<SeededOrder> => {
    const stamp = `${Date.now()}-${label}`
    const order = await payload.create({
      collection: 'orders',
      data: {
        code: `ORD-E2E-REF-${stamp}`,
        buyer: buyerId,
        totalAmount: SALE_PRICE,
        currency: 'VND',
        status,
        paymentSource: 'wallet',
        paidAt: paidAt.toISOString(),
        notes: `E2E refund console fixture (${label})`,
      },
      overrideAccess: true,
    })

    const orderItem = await payload.create({
      collection: 'order_items',
      data: {
        order: Number(order.id),
        product: productId,
        seller: sellerId,
        salePrice: SALE_PRICE,
        platformFee: PLATFORM_FEE,
        sellerAmount: SELLER_AMOUNT,
        tax: 0,
        policyVersion: 'v1',
      },
      overrideAccess: true,
    })

    const earning = await payload.create({
      collection: 'seller_earnings',
      data: {
        seller: sellerId,
        order: Number(order.id),
        orderItem: Number(orderItem.id),
        product: productId,
        salePrice: SALE_PRICE,
        platformFee: PLATFORM_FEE,
        sellerAmount: SELLER_AMOUNT,
        tax: 0,
        commissionRate: PLATFORM_FEE / SALE_PRICE,
        currency: 'VND',
        status: 'PENDING',
        holdPeriodDays: 7,
        holdUntil: new Date(Date.now() + 7 * DAY_MS).toISOString(),
        policyVersion: 'v1',
      },
      overrideAccess: true,
    })

    const record: SeededOrder = {
      orderId: Number(order.id),
      orderCode: String(order.code),
      orderItemId: Number(orderItem.id),
      earningId: Number(earning.id),
    }
    seeded.push(record)
    return record
  }

  const loginAsAdmin = async (page: Page): Promise<void> => {
    await page.goto(`${baseURL}/login`)
    await page.locator('input[name="email"], input[type="email"]').first().fill(operatorEmail)
    await page
      .locator('input[name="password"], input[type="password"]')
      .first()
      .fill(TEST_USERS.admin.password)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(/\/(admin|finance|account|shop)/)
  }

  const openRefundModalOnCurrentPage = async (page: Page): Promise<void> => {
    const openButton = page.getByRole('button', { name: 'Thực hiện hoàn tiền bồi hoàn' })
    const refundsTab = page.getByRole('button', { name: /Lịch sử bồi hoàn/ })

    // A dev-mode page hydrates after paint, so the first click can land before React attached the
    // handler; the tab then never switches and the action button never renders. Retry the click
    // until the tab actually switched (provable: the action button appeared), which also guarantees
    // React is in charge before any form control is touched.
    for (let attempt = 0; attempt < 8; attempt++) {
      if (await openButton.isVisible().catch(() => false)) break
      await refundsTab.click({ timeout: 2000 }).catch(() => undefined)
      await page.waitForTimeout(300)
    }

    await openButton.click()
    await expect(page.locator('#refundOrderId')).toBeVisible()
  }

  const openRefundModal = async (page: Page): Promise<void> => {
    await page.goto(`${baseURL}/finance`)
    await openRefundModalOnCurrentPage(page)
  }

  const refundRowOf = async (orderId: number) => {
    const found = await payload.find({
      collection: 'refunds',
      where: { order: { equals: orderId } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    return found.docs
  }

  const submitButton = (page: Page) =>
    page.getByRole('button', { name: 'Xác nhận hoàn tiền' })

  /**
   * Selects the fault basis and proves React registered it: a dev-mode page hydrates after paint, so
   * a click can land before the handler is attached (the DOM radio ends up checked while the
   * component state stays empty, which leaves the submit disabled). Retry until the component's own
   * blocked-reason stops saying "choose a basis" — reading it with a BOUNDED call, because the
   * console legitimately unmounts that element the moment a basis is chosen.
   */
  const chooseBasis = async (page: Page, basis: 'SELLER' | 'PLATFORM'): Promise<void> => {
    const radio = page.locator(basis === 'SELLER' ? '#faultBasisSeller' : '#faultBasisPlatform')
    const blockedReason = page.getByTestId('refund-blocked-reason')
    for (let attempt = 0; attempt < 6; attempt++) {
      // The element disappears as soon as a basis registers, so an un-timed `textContent()` would
      // wait for something that is never coming back and consume the whole test timeout — which is
      // how this helper turned a correct console into a red spec. `count()` never waits, and the
      // text read is capped too.
      if ((await blockedReason.count()) === 0) return
      const text = await blockedReason.textContent({ timeout: 1000 }).catch(() => null)
      if (text === null || !text.includes('chọn cơ sở lỗi')) return
      await radio.check({ timeout: 2000 }).catch(() => undefined)
      await page.waitForTimeout(250)
    }
    // Six attempts without the basis registering is a real failure, not a hang: this asserts the
    // EFFECT the loop exists for. The reason itself stays asserted where it exists, by positive
    // assertions that cannot pass on a missing element — test 1's
    // `toContainText('Vui lòng chọn cơ sở lỗi')` and test 2's `toContainText('cần bật xác nhận ghi đè')`.
    await expect(radio).toBeChecked()
  }

  test.beforeAll(async () => {
    payload = await getTestPayload()

    // Self-healing first: a previous run killed mid-flight (the machine OOM-kills Chromium whenever
    // several suites run at once) never executed its `afterAll`, and its orders/products would
    // otherwise surface as failures in THIS run. The sweep is namespaced to what this spec mints
    // (`ORD-E2E-REF-*` orders, `refund-console-*` products) and never touches another suite's
    // fixture identities. The wallet-bound buyers are deliberately excluded — see the module note.
    await sweepFinanceRefundResidue(payload)

    buyerId = await findOrCreateRefundBuyer()

    // The seller is an account this spec owns (see findOrCreateRefundSeller); it is only referenced,
    // never credited, so it stays deletable afterwards and no fixture identity is touched.
    sellerId = await findOrCreateRefundSeller()
    await findOrCreateRefundOperator()

    // This spec owns its product instead of borrowing a fixture product: `products.seller` is
    // ON DELETE SET NULL, so a fixture product adopted by the suite's find-or-create can carry a
    // null seller (the OrderItems hook then refuses every order item for it), and this spec must not
    // depend on, or repair, rows another suite owns. `afterAll` deletes it again.
    productSlug = `refund-console-${Date.now()}`
    const product = await payload.create({
      collection: 'products',
      data: {
        title: `E2E refund console product ${productSlug}`,
        slug: productSlug,
        price: SALE_PRICE,
        isFree: false,
        seller: sellerId,
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    productId = Number(product.id)
  })

  test.afterAll(async () => {
    // The same namespaced sweep `beforeAll` runs, so this spec's residue is removed on the ordinary
    // exit path as well as healed at the start of the next run. It replaces the per-record loop: by
    // prefix it also catches rows a killed run created before its bookkeeping recorded them.
    await sweepFinanceRefundResidue(payload)

    // The seller and operator accounts this spec owns. Neither ever received money, so no wallet
    // blocks their deletion (unlike the buyers, whose refund credits make them wallet-bound by
    // design and BR-03's trigger — which is why they are never swept).
    for (const email of [REFUND_SELLER_EMAIL, REFUND_OPERATOR_EMAIL]) {
      const user = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of user.docs) {
        await payload
          .delete({ collection: 'users', id: doc.id, overrideAccess: true })
          .catch(() => undefined)
      }
    }
  })

  test('an in-window refund carries the chosen fault basis and cannot be sent without one', async ({
    page,
  }) => {
    const order = await seedOrder(new Date(), 'in-window')

    await loginAsAdmin(page)
    await openRefundModal(page)

    await page.locator('#refundOrderId').fill(String(order.orderId))
    await page.locator('#refundReason').fill('Lỗi hệ thống: file không tải được dù đã thanh toán')

    // The console states the window it evaluated from orders.paidAt.
    await expect(page.getByTestId('refund-window-status')).toContainText(
      `Trong cửa sổ ${REFUND_WINDOW_DAYS} ngày`,
    )

    // No basis chosen yet: the action cannot be submitted.
    const submit = submitButton(page)
    await expect(submit).toBeDisabled()
    await expect(page.getByTestId('refund-blocked-reason')).toContainText('Vui lòng chọn cơ sở lỗi')
    expect(await refundRowOf(order.orderId)).toHaveLength(0)

    // Platform fault: the seller keeps their share and matures normally.
    await chooseBasis(page, 'PLATFORM')
    await expect(submit).toBeEnabled()
    await submit.click()

    await expect(page.getByText(/Đã thực hiện bồi hoàn đơn hàng/)).toBeVisible()

    const rows = await refundRowOf(order.orderId)
    expect(rows).toHaveLength(1)
    expect(rows[0].faultBasis).toBe('PLATFORM')
    expect(rows[0].outOfWindow).toBe(false)
    expect(Number(rows[0].sellerAmountRefunded)).toBe(0)

    const earning = await payload.findByID({
      collection: 'seller_earnings',
      id: order.earningId,
      overrideAccess: true,
    })
    expect(earning.status).toBe('PENDING')

    const orderAfter = await payload.findByID({
      collection: 'orders',
      id: order.orderId,
      overrideAccess: true,
    })
    expect(orderAfter.status).toBe('REFUNDED')
  })

  test('a refund outside the 5-day window requires the operator override before it can be sent', async ({
    page,
  }) => {
    const order = await seedOrder(new Date(Date.now() - 6 * DAY_MS), 'known-out-of-window')

    await loginAsAdmin(page)
    await openRefundModal(page)

    await page.locator('#refundOrderId').fill(String(order.orderId))
    await page.locator('#refundReason').fill('File lỗi phát hiện sau khi hết cửa sổ 5 ngày')

    // The console does not hide that this is out of policy.
    await expect(page.getByTestId('refund-window-status')).toContainText('Ngoài cửa sổ 5 ngày')
    await expect(page.getByTestId('refund-window-status')).toContainText('ngoài chính sách')
    await expect(page.locator('#overrideWindow')).toBeVisible()

    // Seller fault: the seller's earning is reversed.
    await chooseBasis(page, 'SELLER')
    const submit = submitButton(page)
    await expect(submit).toBeDisabled()
    await expect(page.getByText(/cần bật xác nhận ghi đè/)).toBeVisible()
    expect(await refundRowOf(order.orderId)).toHaveLength(0)

    await page.locator('#overrideWindow').check()
    await expect(submit).toBeEnabled()
    await submit.click()

    await expect(page.getByText(/Đã thực hiện bồi hoàn đơn hàng/)).toBeVisible()

    const rows = await refundRowOf(order.orderId)
    expect(rows).toHaveLength(1)
    expect(rows[0].faultBasis).toBe('SELLER')
    expect(rows[0].outOfWindow).toBe(true)
    expect(Number(rows[0].sellerAmountRefunded)).toBe(SELLER_AMOUNT)

    const earning = await payload.findByID({
      collection: 'seller_earnings',
      id: order.earningId,
      overrideAccess: true,
    })
    expect(earning.status).toBe('REVERSED')
  })

  test('an out-of-window order the console holds no verdict for is refused by the route with a message, then succeeds with the override', async ({
    page,
  }) => {
    // The order is rendered while it is NOT COMPLETED, so the console holds no window verdict for it
    // (`inWindow: null`) — the case where the route, not the console, is the authority for the
    // window. It becomes refundable only after that render, which keeps the console's own knowledge
    // out of the picture; whatever the page does afterwards, the refusal must reach the operator as
    // a message instead of dead-ending the button.
    const order = await seedOrder(new Date(Date.now() - 6 * DAY_MS), 'unjudged-window', 'CANCELLED')

    await loginAsAdmin(page)
    await page.goto(`${baseURL}/finance`)
    await page.waitForTimeout(750)

    await payload.update({
      collection: 'orders',
      id: order.orderId,
      data: { status: 'COMPLETED' },
      overrideAccess: true,
    })

    // No navigation here: reloading would put the fresh state in the console's list.
    await openRefundModalOnCurrentPage(page)
    await page.locator('#refundOrderId').fill(String(order.orderId))
    await page.locator('#refundReason').fill('Yêu cầu hoàn tiền sau 5 ngày')
    await chooseBasis(page, 'SELLER')

    const submit = submitButton(page)

    if (await submit.isEnabled()) {
      // No override was sent: the ROUTE must refuse, and the refusal must be readable in the modal.
      await submit.click()
      const refundError = page.getByTestId('refund-error')
      await expect(refundError).toBeVisible()
      await expect(refundError).toContainText(/cửa sổ|window/i)
      expect(await refundRowOf(order.orderId)).toHaveLength(0)
    } else {
      // The console converged to the authoritative verdict first and already demands the override;
      // that is the same policy enforced one step earlier, and it must be stated, not implied.
      await expect(page.getByTestId('refund-window-status')).toContainText('Ngoài cửa sổ')
      await expect(page.getByTestId('refund-blocked-reason')).toContainText(
        'cần bật xác nhận ghi đè',
      )
    }

    // Either way the refund goes through only with the explicitly recorded override.
    await page.locator('#overrideWindow').check()
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByText(/Đã thực hiện bồi hoàn đơn hàng/)).toBeVisible()

    const rows = await refundRowOf(order.orderId)
    expect(rows).toHaveLength(1)
    expect(rows[0].outOfWindow).toBe(true)
  })

  test('an already-refunded order reads as a message instead of a dead button', async ({ page }) => {
    const order = await seedOrder(new Date(), 'already-refunded')

    await loginAsAdmin(page)
    await openRefundModal(page)
    await page.locator('#refundOrderId').fill(String(order.orderId))
    await page.locator('#refundReason').fill('Hoàn tiền lần đầu')
    await chooseBasis(page, 'SELLER')
    await submitButton(page).click()
    await expect(page.getByText(/Đã thực hiện bồi hoàn đơn hàng/)).toBeVisible()
    expect(await refundRowOf(order.orderId)).toHaveLength(1)

    // Second attempt on the same order: the route's own refusal must reach the operator.
    await openRefundModal(page)
    await page.locator('#refundOrderId').fill(String(order.orderId))
    await page.locator('#refundReason').fill('Hoàn tiền lần hai')
    await chooseBasis(page, 'SELLER')
    await submitButton(page).click()

    await expect(page.getByTestId('refund-error')).toBeVisible()
    await expect(page.getByTestId('refund-error')).toContainText(/already|đã được hoàn/i)
    expect(await refundRowOf(order.orderId)).toHaveLength(1)
  })
})
