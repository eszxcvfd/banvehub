/**
 * web/tests/helpers/probe-ui-api-contracts.mts
 *
 * The scripted sweep for `docs/plans/active/ui-api-integration.md`. It walks the Inventory table and
 * sends each UI data path the request its own code sends — same method, URL, query, credentials
 * (the session of the identity the UI runs as, i.e. same-origin cookies) and Content-Type — then
 * asserts the response is not a dead end:
 *
 *   - never a missing-route 404 (Payload's `{"message":"Route not found \"/api/...\""}`)
 *   - never a 5xx
 *   - 401/403 only on rows whose UI code handles that status (declared per row)
 *   - a resource-level 404 only where the inventory records it as the UI's handled branch
 *     (`resource404` rows below), so a real route-missing 404 cannot hide behind it
 *
 * Rows A1-A44 are the client `fetch()` sites; they are swept over HTTP exactly as they are written.
 * Rows B1-B34 are server components reading Payload's local API — the same collections, so they are
 * swept through the REST equivalent of the same collection with the identity the page runs as, which
 * exercises the same access function. B30 is the one repaired row on that side, so it is proved
 * in-process below (transport stubbed) rather than through a route.
 *
 * READ-ONLY. No purchase, top-up, withdrawal, refund, comment, review, ticket, report, product or
 * media row is created or changed by this script. A UI path that writes is instead exercised with the
 * UI's own method/URL/headers and a body that the route must reject with its own 400 *before* any
 * write (`kind: 'validation-probe'`), or with a method the route does not implement (`kind:
 * 'existence'`, answered 405), or it is printed as `skip` with the reason. Two disclosed exceptions:
 *   - A42 re-applies buyer01's *current* password with the UI's own body — no credential change; the
 *     run re-logs-in at the end to prove it (see the integrity check);
 *   - A9-A++ reads (never writes) an existing payment intent by code, which is the owner's own poll.
 *
 * Fixtures are discovered read-only from the same database the dev server uses. A row whose fixture is
 * absent is printed as `skip` with the reason — never silently dropped.
 *
 * Usage (dev server on http://localhost:3000, from `web/`):
 *   NODE_OPTIONS="--no-deprecation --import tsx/esm" node tests/helpers/probe-ui-api-contracts.mts
 *
 * Exit code 0 = every gated row passed. Non-zero = at least one row is a dead end; each failure is
 * printed with its status, method, URL, identity and a response excerpt.
 *
 * Identities are the seeded dev users from `web/scripts/seed-realistic.mts`: buyer01@kientaohub.vn
 * (user 9), seller01@kientaohub.vn (4), finance@kientaohub.vn (2), moderator@kientaohub.vn (3); the
 * password is `devPassword` at scripts/seed-realistic.mts:701, overridable via $PROBE_DEV_PASSWORD.
 * The owner's own admin account is deliberately not used.
 */
import 'dotenv/config'

import { getPayload } from 'payload'

import config from '../../src/payload.config'
import { sendOrderAccessEmail } from '../../src/components/forms/FindOrderForm/sendOrderAccessEmail'

const BASE = process.env.PROBE_BASE_URL || 'http://localhost:3000'
// devPassword — `web/scripts/seed-realistic.mts:701`
const DEV_PASSWORD = process.env.PROBE_DEV_PASSWORD || 'KienTao@2026'

const BUYER_EMAIL = 'buyer01@kientaohub.vn'
const SELLER_EMAIL = 'seller01@kientaohub.vn'
const FINANCE_EMAIL = 'finance@kientaohub.vn'
const MODERATOR_EMAIL = 'moderator@kientaohub.vn'

type Who = 'anon' | 'buyer' | 'seller' | 'finance' | 'moderator'

type Kind = 'read' | 'validation-probe' | 'existence'

type Row = {
  /** Inventory row id, or `<id>+` for an extra probe that proves a branch the row's UI handles. */
  row: string
  /** Inventory row id when the probe is not the row itself (extras share their row's id). */
  inventoryId?: string
  ui: string
  who: Who
  method: string
  path: string
  json?: unknown
  form?: FormData
  expect: number[]
  kind: Kind
  /** The UI's own code renders/absorbs this status instead of treating it as a failure. */
  handled?: boolean
  /** The inventory records a resource-level 404 on this path as the UI's handled branch. */
  resource404?: boolean
  note?: string
}

type Outcome = {
  row: Row
  status: number | null
  body: string
  failure: string | null
}

const jars: Partial<Record<Who, string>> = {}

const setCookiesOf = (headers: Headers): string[] => {
  const withGetSetCookie = headers as unknown as { getSetCookie?: () => string[] }
  if (typeof withGetSetCookie.getSetCookie === 'function') return withGetSetCookie.getSetCookie()
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

const login = async (who: Exclude<Who, 'anon'>, email: string): Promise<string> => {
  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
  })
  const cookie = setCookiesOf(res.headers)
    .map((value) => value.split(';')[0])
    .find((value) => value.startsWith('payload-token='))

  if (!res.ok || !cookie) {
    throw new Error(
      `login failed for ${email} (${res.status}): ${(await res.text()).slice(0, 200)}\n` +
        `The sweep needs the seeded identities; see scripts/seed-realistic.mts (devPassword, :701).`,
    )
  }

  jars[who] = cookie
  return cookie
}

const excerpt = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 160)

/**
 * A response fails the sweep when it is a 5xx, a route-missing 404, an unexpected status, an
 * unhandled 401/403, or a resource 404 the row did not declare. The route-missing body is checked
 * before the expected-status list so a missing route can never pass as a "documented 404".
 */
const judge = (row: Row, status: number, body: string): string | null => {
  if (status >= 500) return `server error ${status}`
  if (/Route not found/i.test(body)) return `route missing (404 from Payload's catch-all)`
  if (!row.expect.includes(status)) return `expected ${row.expect.join(' or ')}, got ${status}`
  if ((status === 401 || status === 403) && !row.handled) return `unhandled ${status}`
  if (status === 404 && !row.resource404) return 'undeclared resource 404'
  return null
}

const call = async (row: Row): Promise<Outcome> => {
  const headers: Record<string, string> = {}
  const jar = jars[row.who]
  if (row.who !== 'anon' && jar) headers.Cookie = jar

  let body: BodyInit | undefined
  if (row.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(row.json)
  } else if (row.form) {
    body = row.form
  }

  let status: number | null = null
  let text = ''
  try {
    // `redirect: 'manual'`: a redirect must fail the row loudly instead of being followed into HTML.
    const res = await fetch(`${BASE}${row.path}`, { method: row.method, headers, body, redirect: 'manual' })
    status = res.status
    text = await res.text()
  } catch (error) {
    return { row, status: null, body: '', failure: `unreachable: ${(error as Error)?.message}` }
  }

  return { row, status, body: text, failure: judge(row, status, text) }
}

const align = (value: string, width: number): string => value.padEnd(width).slice(0, width)

const printOutcome = (outcome: Outcome): void => {
  const { row } = outcome
  const flag = outcome.failure ? 'FAIL' : ' ok '
  const status = outcome.status === null ? 'ERR' : String(outcome.status)
  const label = row.kind === 'validation-probe' ? 'probe' : row.kind
  console.log(
    `[ ${flag} ] ${align(row.row, 7)} ${align(status, 4)} ${align(row.method, 6)} ${align(label, 11)} ` +
      `${align(row.path, 62)} (${row.who})`,
  )
  if (outcome.failure) {
    console.log(`         ${outcome.failure}`)
    console.log(`         body: ${excerpt(outcome.body) || '<empty>'}`)
  }
}

const skipped: string[] = []

const buildRows = (fx: Fixtures): { rows: Row[]; followups: Row[] } => {
  const rows: Row[] = []
  const followups: Row[] = []

  const row = (r: Row): void => {
    rows.push(r)
  }
  const skip = (r: Omit<Row, 'method' | 'path' | 'expect' | 'kind'>, reason: string): void => {
    skipped.push(`${r.row}: ${reason}`)
  }

  // ---------------------------------------------------------------- A. client fetch() paths
  row({ row: 'A1', ui: 'components/checkout/CheckoutPage.tsx:85', who: 'buyer', method: 'GET', path: '/api/v1/me/wallet', expect: [200], kind: 'read' })
  row({ row: 'A2', ui: 'components/checkout/CheckoutPage.tsx:172', who: 'buyer', method: 'POST', path: '/api/v1/orders/purchase', json: {}, expect: [400], kind: 'validation-probe', note: 'productId is required → 400 before any money write' })
  row({ row: 'A2+', inventoryId: 'A2', ui: 'components/checkout/CheckoutPage.tsx:179', who: 'anon', method: 'POST', path: '/api/v1/orders/purchase', json: {}, expect: [401], kind: 'read', handled: true, note: 'the signed-out branch the UI renders from data.message' })
  row({ row: 'A6', ui: 'components/wallet/WalletClient.tsx:136', who: 'buyer', method: 'POST', path: '/api/v1/payments/topup', json: { amount: 9999 }, expect: [400], kind: 'validation-probe', note: 'below the 10.000₫ floor → 400 before any intent is created' })
  row({ row: 'A7', ui: 'components/wallet/WalletClient.tsx:160', who: 'buyer', method: 'GET', path: '/api/v1/me/wallet', expect: [200], kind: 'read' })
  row({ row: 'A8', ui: 'components/wallet/WalletClient.tsx:161', who: 'buyer', method: 'GET', path: '/api/v1/me/wallet/ledger?limit=50', expect: [200], kind: 'read' })

  if (fx.buyerIntentCode) {
    const path = `/api/v1/payments/${fx.buyerIntentCode}`
    row({ row: 'A9', ui: 'components/wallet/WalletClient.tsx:184', who: 'buyer', method: 'GET', path, expect: [200], kind: 'read', note: 'the owner polling its own intent' })
    row({ row: 'A9+', inventoryId: 'A9', ui: 'components/wallet/WalletClient.tsx:185', who: 'anon', method: 'GET', path, expect: [401], kind: 'read', handled: true, note: 'repair: an anonymous caller can no longer read the intent (was 200 with bank details)' })
    row({ row: 'A9+', inventoryId: 'A9', ui: 'components/wallet/WalletClient.tsx:185', who: 'seller', method: 'GET', path, expect: [404], kind: 'read', handled: true, resource404: true, note: 'repair: a non-owner gets the same body as an unknown code, so codes stay unenumerable' })
    row({ row: 'A9+', inventoryId: 'A9', ui: 'components/wallet/WalletClient.tsx:185', who: 'buyer', method: 'GET', path: '/api/v1/payments/KHONG-CO-MA-NAY', expect: [404], kind: 'read', handled: true, resource404: true, note: 'unknown code → the 404 the UI skips via res.ok' })
    row({ row: 'A9+', inventoryId: 'A9', ui: 'components/wallet/WalletClient.tsx:185', who: 'finance', method: 'GET', path, expect: [200], kind: 'read', note: 'admin/financeAdmin may read any intent (paymentIntentReadAccess)' })
  } else {
    skip({ row: 'A9', ui: 'components/wallet/WalletClient.tsx:184', who: 'buyer' }, 'no payment intent owned by buyer01 to poll; creating one is a money write and is out of the read-only sweep')
  }

  if (fx.ownedProductId !== null) {
    const owned = fx.ownedProductId
    row({ row: 'A10', ui: 'components/download/DownloadButton.tsx:50', who: 'buyer', method: 'POST', path: '/api/v1/downloads/token', json: { productId: owned }, expect: [200, 403], kind: 'read', note: 'the fixture is an entitlement buyer01 already holds, so the route issues a signed token instead of self-granting a free product; 403 is the unowned branch the UI renders from data.message' })
    row({ row: 'A11', ui: 'components/product/DigitalProductCTA.tsx:118', who: 'buyer', method: 'GET', path: `/api/v1/me/entitlements?productId=${owned}`, expect: [200], kind: 'read' })
    row({ row: 'A11+', inventoryId: 'A11', ui: 'components/product/DigitalProductCTA.tsx:189', who: 'anon', method: 'GET', path: `/api/v1/me/entitlements?productId=${owned}`, expect: [200], kind: 'read', note: 'the anonymous branch returns 200 {isAuthenticated:false}, which the UI reads with res.ok' })
    row({ row: 'A12', ui: 'components/product/DigitalProductCTA.tsx:248', who: 'buyer', method: 'POST', path: '/api/v1/downloads/token', json: { productId: owned }, expect: [200, 403], kind: 'read' })
    row({ row: 'A12+', inventoryId: 'A12', ui: 'components/product/DigitalProductCTA.tsx:258', who: 'anon', method: 'POST', path: '/api/v1/downloads/token', json: { productId: owned }, expect: [401], kind: 'read', handled: true, note: 'the 401 the UI maps to its login modal' })
  } else {
    skip({ row: 'A10', ui: 'components/download/DownloadButton.tsx:50', who: 'buyer' }, 'buyer01 has no active entitlement, so the free-product self-grant branch (a money write) would be the only way to probe it')
    skip({ row: 'A11', ui: 'components/product/DigitalProductCTA.tsx:118', who: 'buyer' }, 'no entitlement fixture for buyer01')
    skip({ row: 'A12', ui: 'components/product/DigitalProductCTA.tsx:248', who: 'buyer' }, 'no entitlement fixture for buyer01')
  }
  row({ row: 'A13', ui: 'components/product/DigitalProductCTA.tsx:310', who: 'buyer', method: 'POST', path: '/api/v1/orders/purchase', json: {}, expect: [400], kind: 'validation-probe', note: 'the owned-product 409 branch is not re-probed: a 200 would buy a product' })

  const commentProduct = fx.buyerCommentProductId ?? fx.publishedProductId
  const reviewProduct = fx.buyerReviewProductId ?? fx.publishedProductId
  if (commentProduct !== null) {
    row({ row: 'A14', ui: 'components/product/ProductCommentsSection.tsx:129', who: 'anon', method: 'GET', path: `/api/v1/products/${commentProduct}/comments?page=1&limit=10`, expect: [200], kind: 'read' })
    row({ row: 'A15', ui: 'components/product/ProductCommentsSection.tsx:171', who: 'buyer', method: 'POST', path: `/api/v1/products/${commentProduct}/comments`, json: { content: 'ab' }, expect: [400], kind: 'validation-probe', note: 'under the 3-character floor → 400 before any comment is written' })
    row({ row: 'A16', ui: 'components/product/ProductCommentsSection.tsx:211', who: 'buyer', method: 'POST', path: `/api/v1/products/${commentProduct}/comments`, json: { parentId: 1, content: 'ab' }, expect: [400], kind: 'validation-probe' })
  } else {
    skip({ row: 'A14', ui: 'components/product/ProductCommentsSection.tsx:129', who: 'anon' }, 'no published product to read comments from')
  }
  if (fx.buyerCommentId !== null && fx.buyerCommentProductId !== null) {
    row({ row: 'A17', ui: 'components/product/ProductCommentsSection.tsx:244', who: 'buyer', method: 'PATCH', path: `/api/v1/products/${fx.buyerCommentProductId}/comments/${fx.buyerCommentId}`, json: { status: 'khong-phai-status' }, expect: [400], kind: 'validation-probe', note: "the UI's real body is {status:'hidden'}, which writes; an invalid status is rejected before the update" })
  } else {
    row({ row: 'A17', ui: 'components/product/ProductCommentsSection.tsx:244', who: 'buyer', method: 'PATCH', path: `/api/v1/products/${commentProduct ?? 0}/comments/999999`, json: { status: 'khong-phai-status' }, expect: [404], kind: 'validation-probe', handled: true, resource404: true, note: 'this database holds no comment at all, so the probe reaches the route\'s documented NOT_FOUND branch; what it proves is that the path is mounted and answers its own error shape (never a missing-route 404 or a 500)' })
  }
  if (reviewProduct !== null) {
    row({ row: 'A18', ui: 'components/product/ProductReviewsSection.tsx:136', who: 'anon', method: 'GET', path: `/api/v1/products/${reviewProduct}/reviews?page=1&limit=6`, expect: [200], kind: 'read' })
    row({ row: 'A19', ui: 'components/product/ProductReviewsSection.tsx:219', who: 'buyer', method: 'POST', path: `/api/v1/products/${reviewProduct}/reviews`, json: { rating: 99, title: 'probe', content: 'noi dung du dai de qua buoc kiem tra' }, expect: [400], kind: 'validation-probe', note: 'rating outside 1..5 → 400 before any review is written' })
  } else {
    skip({ row: 'A18', ui: 'components/product/ProductReviewsSection.tsx:136', who: 'anon' }, 'no published product to read reviews from')
  }
  if (fx.buyerReviewProductId !== null) {
    row({ row: 'A19+', inventoryId: 'A19', ui: 'components/product/ProductReviewsSection.tsx:219', who: 'buyer', method: 'PUT', path: `/api/v1/products/${fx.buyerReviewProductId}/reviews`, json: { rating: 99, title: 'probe', content: 'noi dung du dai de qua buoc kiem tra' }, expect: [400], kind: 'validation-probe', note: "the UI picks PUT when isEditing; buyer01 has a review on this product so the branch resolves" })
  } else {
    row({ row: 'A19+', inventoryId: 'A19', ui: 'components/product/ProductReviewsSection.tsx:219', who: 'buyer', method: 'PUT', path: `/api/v1/products/${reviewProduct ?? 0}/reviews`, json: { rating: 99, title: 'probe', content: 'noi dung du dai de qua buoc kiem tra' }, expect: [404], kind: 'validation-probe', handled: true, resource404: true, note: 'no review of buyer01 exists in this database, so the branch answers its documented "no review to edit" NOT_FOUND; the rating validation it shares with POST is proved by A19' })
  }

  const anyProduct = fx.publishedProductId
  if (anyProduct !== null) {
    row({ row: 'A20', ui: 'components/product/ProductReportDialog.tsx:72', who: 'buyer', method: 'POST', path: `/api/v1/products/${anyProduct}/reports`, json: { reason: 'KHONG-PHAI-REASON' }, expect: [400], kind: 'validation-probe', note: 'the enum the dialog imports is the enum the route validates against' })
  } else {
    skip({ row: 'A20', ui: 'components/product/ProductReportDialog.tsx:72', who: 'buyer' }, 'no published product to report')
  }

  row({ row: 'A21', ui: 'components/dispute/OrderDisputeModal.tsx:102', who: 'buyer', method: 'POST', path: '/api/v1/tickets', json: {}, expect: [400], kind: 'validation-probe', note: 'reason/subject/description are required → 400 before any ticket is written' })
  if (fx.buyerTicketId !== null) {
    row({ row: 'A22', ui: 'components/dispute/OrderTicketsSection.tsx:111', who: 'buyer', method: 'POST', path: `/api/v1/tickets/${fx.buyerTicketId}/messages`, json: {}, expect: [400], kind: 'validation-probe', note: 'an empty message is rejected before the reply is appended' })
    row({ row: 'A23', ui: 'components/dispute/OrderTicketsSection.tsx:137', who: 'buyer', method: 'PATCH', path: `/api/v1/tickets/${fx.buyerTicketId}`, json: { status: 'KHONG-PHAI-STATUS' }, expect: [403], kind: 'validation-probe', handled: true, note: "the UI's real body closes the ticket; a buyer may only set CLOSED/RESOLVED, and the other value is refused before the write" })
  } else {
    row({ row: 'A22', ui: 'components/dispute/OrderTicketsSection.tsx:111', who: 'buyer', method: 'POST', path: '/api/v1/tickets/999999/messages', json: {}, expect: [404], kind: 'validation-probe', handled: true, resource404: true, note: 'this database holds no ticket, so the probe reaches the route\'s documented NOT_FOUND branch; it proves the path is mounted and answers its own error shape (the UI renders data.message)' })
    row({ row: 'A23', ui: 'components/dispute/OrderTicketsSection.tsx:137', who: 'buyer', method: 'PATCH', path: '/api/v1/tickets/999999', json: { status: 'KHONG-PHAI-STATUS' }, expect: [404], kind: 'validation-probe', handled: true, resource404: true, note: 'no ticket fixture; the route answers its documented NOT_FOUND branch instead of the buyer-status refusal (proved by source: planTicketUpdate :77-85)' })
  }
  row({ row: 'A24', ui: 'app/(app)/(account)/notifications/NotificationsList.tsx:147', who: 'buyer', method: 'POST', path: '/api/v1/me/notifications/999999/read', expect: [404], kind: 'read', handled: true, resource404: true, note: "the inventory's documented NOT_FOUND branch; marking a real row read would be a write" })
  row({ row: 'A25', ui: 'app/(app)/(account)/notifications/NotificationsList.tsx:171', who: 'buyer', method: 'GET', path: '/api/v1/me/notifications/read-all', expect: [405], kind: 'existence', note: 'the POST writes; the 405 proves the route is mounted without touching any notification' })

  row({ row: 'A26', ui: 'app/(app)/finance/FinanceOperations.tsx:118', who: 'finance', method: 'POST', path: '/api/v1/admin/withdrawals/999999/review', expect: [400], kind: 'validation-probe', note: 'unknown id → 400 {error,message}; the console renders data.message' })
  row({ row: 'A26+', inventoryId: 'A26', ui: 'app/(app)/finance/FinanceOperations.tsx:118', who: 'buyer', method: 'POST', path: '/api/v1/admin/withdrawals/999999/review', expect: [403], kind: 'read', handled: true, note: 'decision 0008: the operator console refuses a buyer' })
  row({ row: 'A27', ui: 'app/(app)/finance/FinanceOperations.tsx:141', who: 'finance', method: 'POST', path: '/api/v1/admin/withdrawals/999999/approve', json: { notes: 'probe' }, expect: [400], kind: 'validation-probe' })
  row({ row: 'A28', ui: 'app/(app)/finance/FinanceOperations.tsx:178', who: 'finance', method: 'POST', path: '/api/v1/admin/withdrawals/999999/reject', json: { reason: 'probe' }, expect: [400], kind: 'validation-probe' })
  row({ row: 'A29', ui: 'app/(app)/finance/FinanceOperations.tsx:209', who: 'finance', method: 'POST', path: '/api/v1/admin/withdrawals/999999/process', expect: [400], kind: 'validation-probe' })
  row({ row: 'A30', ui: 'app/(app)/finance/FinanceOperations.tsx:233', who: 'finance', method: 'POST', path: '/api/v1/admin/withdrawals/999999/finalize', expect: [400], kind: 'validation-probe' })
  row({ row: 'A31', ui: 'app/(app)/finance/FinanceOperations.tsx:314', who: 'finance', method: 'POST', path: '/api/v1/admin/refunds', json: {}, expect: [400], kind: 'validation-probe', note: 'orderId is required → 400; a valid body would execute a refund (decision 0012)' })
  row({ row: 'A32', ui: 'app/(app)/finance/FinanceOperations.tsx:353', who: 'finance', method: 'GET', path: '/api/v1/admin/refunds', expect: [200], kind: 'read' })

  if (anyProduct !== null) {
    row({ row: 'A33', ui: 'app/(app)/moderation/ModerationQueue.tsx:70', who: 'moderator', method: 'POST', path: '/api/moderation/action', json: { productId: anyProduct, action: 'khong-phai-action', note: '' }, expect: [400], kind: 'validation-probe', note: 'an unknown action is rejected before the product status is touched' })
    row({ row: 'A33+', inventoryId: 'A33', ui: 'app/(app)/moderation/ModerationQueue.tsx:70', who: 'seller', method: 'POST', path: '/api/moderation/action', json: { productId: anyProduct, action: 'approved', note: '' }, expect: [403], kind: 'read', handled: true, note: 'only admin/moderator may moderate' })
  } else {
    skip({ row: 'A33', ui: 'app/(app)/moderation/ModerationQueue.tsx:70', who: 'moderator' }, 'no published product to name in the moderation body')
  }
  row({ row: 'A34', ui: 'app/(app)/seller/register/RegisterForm.tsx:40', who: 'buyer', method: 'POST', path: '/api/seller/register', json: {}, expect: [400], kind: 'validation-probe', note: 'displayName/sellerTermsAccepted required → 400; a valid body upserts a seller profile' })
  row({ row: 'A35', ui: 'app/(app)/seller/WithdrawalModal.tsx:85', who: 'seller', method: 'POST', path: '/api/v1/seller/withdrawals', json: { amount: 99999999, bankInfo: { bankName: 'VCB', accountNumber: '1', accountHolderName: 'probe' } }, expect: [400], kind: 'validation-probe', note: 'over the 50.000.000₫ cap → 400 before any balance is reserved' })
  row({ row: 'A36', ui: 'app/(app)/seller/WithdrawalHistoryTable.tsx:87', who: 'seller', method: 'POST', path: '/api/v1/seller/withdrawals/999999/cancel', expect: [400], kind: 'validation-probe', note: 'unknown id → 400; cancelling a real one refunds a reserved balance' })

  const noFilePreview = new FormData()
  noFilePreview.append('title', 'probe')
  row({ row: 'A37', ui: 'app/(app)/seller/products/new/ProductEditorForm.tsx:62', who: 'seller', method: 'POST', path: '/api/seller/upload-preview', form: noFilePreview, expect: [400], kind: 'validation-probe', note: 'no file part → 400; the UI always appends a real File, which creates media rows' })
  const textPreview = new FormData()
  textPreview.append('file', 'not-a-file')
  row({ row: 'A37+', inventoryId: 'A37', ui: 'app/(app)/seller/products/new/ProductEditorForm.tsx:62', who: 'seller', method: 'POST', path: '/api/seller/upload-preview', form: textPreview, expect: [400], kind: 'validation-probe', note: 'a non-file part is a bad request, not a 500 (plan: API-side observations)' })
  const noFileUpload = new FormData()
  row({ row: 'A38', ui: 'app/(app)/seller/ProductEditorModal.tsx:116', who: 'seller', method: 'POST', path: '/api/seller/upload-file', form: noFileUpload, expect: [400], kind: 'validation-probe' })
  const textUpload = new FormData()
  textUpload.append('file', 'not-a-file')
  row({ row: 'A38+', inventoryId: 'A38', ui: 'app/(app)/seller/ProductEditorModal.tsx:116', who: 'seller', method: 'POST', path: '/api/seller/upload-file', form: textUpload, expect: [400], kind: 'validation-probe', note: 'a non-file part is a bad request, not a 500 (plan: API-side observations)' })
  row({ row: 'A39', ui: 'app/(app)/seller/products/new/ProductEditorForm.tsx:129', who: 'seller', method: 'POST', path: '/api/seller/products', json: {}, expect: [400], kind: 'validation-probe', note: 'title is required → 400 before any product is created' })

  row({ row: 'A40', ui: 'components/addresses/AddressListing.tsx:68', who: 'buyer', method: 'DELETE', path: '/api/addresses/999999', expect: [403], kind: 'read', handled: true, note: "the UI's response.ok guard renders its fixed failure message; deleting a real address is a write" })
  row({ row: 'A41', ui: 'components/forms/AccountForm/index.tsx:81', who: 'buyer', method: 'PATCH', path: `/api/users/${fx.buyerId}`, json: { email: 'khong-phai-email' }, expect: [400], kind: 'validation-probe', note: 'payload rejects the address before the row is updated; the UI renders errors[0].message' })
  row({ row: 'A42', ui: 'components/forms/AccountForm/index.tsx:125', who: 'buyer', method: 'PATCH', path: `/api/users/${fx.buyerId}`, json: { password: DEV_PASSWORD, passwordConfirm: DEV_PASSWORD }, expect: [200], kind: 'read', note: "the UI's own body re-applied to the same account: no credential change, proved by the re-login at the end of this run" })
  row({ row: 'A43', ui: 'components/forms/CreateAccountForm/index.tsx:84', who: 'anon', method: 'POST', path: '/api/users', json: { email: BUYER_EMAIL, password: DEV_PASSWORD, passwordConfirm: DEV_PASSWORD }, expect: [400], kind: 'validation-probe', note: 'duplicate email → 400 with the errors[0].message the form reads' })
  row({ row: 'A44', ui: 'components/forms/ForgotPasswordForm/index.tsx:46', who: 'anon', method: 'POST', path: '/api/users/forgot-password', json: { email: 'probe-ui-api-contracts-nonexistent@example.com' }, expect: [200], kind: 'read' })

  // ------------------------------------------- B. server components reading the local API (REST equivalent)
  const b = (rowId: string, ui: string, who: Who, path: string, note?: string): void => {
    row({ row: rowId, ui, who, method: 'GET', path, expect: [200], kind: 'read', note })
  }
  b('B1', 'app/(app)/(account)/account/page.tsx:24', 'buyer', `/api/orders?limit=5&depth=2&where[buyer][equals]=${fx.buyerId}&sort=-createdAt`)
  b('B2', 'app/(app)/(account)/notifications/page.tsx:41', 'buyer', '/api/notifications?limit=1&depth=0')
  if (fx.buyerOrderId !== null) {
    b('B3', 'app/(app)/(account)/orders/[id]/page.tsx:40', 'buyer', `/api/orders/${fx.buyerOrderId}?depth=2`)
    b('B4', 'app/(app)/(account)/orders/[id]/page.tsx:52', 'buyer', `/api/order_items?where[order][equals]=${fx.buyerOrderId}&depth=2&limit=100`)
    b('B5', 'app/(app)/(account)/orders/[id]/page.tsx:66', 'buyer', `/api/tickets?where[order][equals]=${fx.buyerOrderId}&depth=1&limit=100`)
  } else {
    skip({ row: 'B3', ui: 'app/(app)/(account)/orders/[id]/page.tsx:40', who: 'buyer' }, 'buyer01 has no order to open')
    skip({ row: 'B4', ui: 'app/(app)/(account)/orders/[id]/page.tsx:52', who: 'buyer' }, 'buyer01 has no order')
    skip({ row: 'B5', ui: 'app/(app)/(account)/orders/[id]/page.tsx:66', who: 'buyer' }, 'buyer01 has no order')
  }
  b('B6', 'app/(app)/(account)/orders/page.tsx:24', 'buyer', `/api/orders?limit=100&depth=2&where[buyer][equals]=${fx.buyerId}&sort=-createdAt`)
  b('B7', 'app/(app)/[slug]/page.tsx:17', 'anon', '/api/pages?limit=1000&depth=0&pagination=false&select[slug]=true')
  b('B8', 'app/(app)/[slug]/page.tsx:87', 'anon', '/api/pages?limit=1&depth=0&pagination=false&where[and][0][slug][equals]=home&where[and][1][_status][equals]=published')
  b('B9', 'app/(app)/finance/page.tsx:32', 'finance', '/api/withdrawals?limit=100&depth=1&sort=-requestedAt')
  b('B10', 'app/(app)/finance/page.tsx:56', 'finance', '/api/refunds?limit=100&depth=1&sort=-createdAt')
  b('B11', 'app/(app)/finance/page.tsx:85', 'finance', '/api/orders?limit=100&depth=0&sort=-createdAt')
  b('B12', 'app/(app)/moderation/page.tsx:23', 'moderator', '/api/products?limit=100&depth=2&sort=createdAt&where[moderationStatus][in][0]=submitted&where[moderationStatus][in][1]=in_review')
  b('B13', 'app/(app)/page.tsx:145', 'anon', '/api/products?limit=5&depth=1&where[_status][equals]=published&sort=-createdAt')
  if (fx.publishedProductSlug) {
    b('B14', 'app/(app)/products/[slug]/page.tsx:442', 'anon', `/api/products?limit=1&depth=3&where[slug][equals]=${fx.publishedProductSlug}`)
  } else {
    skip({ row: 'B14', ui: 'app/(app)/products/[slug]/page.tsx:442', who: 'anon' }, 'no published product slug in this database')
  }
  b('B15', 'app/(app)/seller/page.tsx:44', 'seller', `/api/seller_profiles?where[user][equals]=${fx.sellerId}&limit=1&depth=1`)
  b('B16', 'app/(app)/seller/page.tsx:51', 'seller', `/api/withdrawals?where[seller][equals]=${fx.sellerId}&limit=50&depth=1&sort=-createdAt`)
  b('B17', 'app/(app)/seller/page.tsx:58', 'seller', `/api/seller_earnings?where[seller][equals]=${fx.sellerId}&limit=1000&depth=1`)
  b('B18', 'app/(app)/seller/page.tsx:65', 'seller', `/api/products?where[seller][equals]=${fx.sellerId}&limit=100&sort=-createdAt`)
  b('B19', 'app/(app)/seller/page.tsx:72', 'seller', '/api/categories?limit=100&pagination=false&depth=0')
  b('B19+', 'app/(app)/seller/page.tsx:73', 'seller', '/api/software_types?limit=100&pagination=false&depth=0')
  b('B19+', 'app/(app)/seller/page.tsx:74', 'seller', '/api/tags?limit=100&pagination=false&depth=0')
  b('B20', 'app/(app)/seller/register/page.tsx:24', 'buyer', `/api/seller_profiles?where[user][equals]=${fx.buyerId}&limit=1`)
  b('B21', 'app/(app)/shop/page.tsx:35', 'anon', '/api/categories?limit=1&depth=0&select[title]=true&select[slug]=true&select[description]=true')
  b('B22', 'app/(app)/shop/page.tsx:60', 'anon', '/api/software_types?limit=1&depth=0&select[title]=true&select[slug]=true')
  b('B23', 'app/(app)/shop/page.tsx:319', 'anon', '/api/categories?limit=50&depth=0&select[slug]=true&where[or][0][title][like]=ban&where[or][1][slug][like]=ban')
  b('B24', 'app/(app)/shop/page.tsx:376', 'anon', '/api/products?limit=12&depth=1&where[_status][equals]=published')
  b('B25', 'app/(app)/sitemap.ts:58', 'anon', '/api/products?limit=1000&depth=0&pagination=false&select[slug]=true&where[_status][equals]=published')
  b('B26', 'app/(app)/sitemap.ts:86', 'anon', '/api/categories?limit=1000&pagination=false&select[slug]=true&where[or][0][status][equals]=active&where[or][1][status][exists]=false')
  b('B27', 'app/(app)/sitemap.ts:113', 'anon', '/api/software_types?limit=1000&pagination=false&select[slug]=true&select[updatedAt]=true')
  b('B28', 'app/(app)/sitemap.ts:135', 'anon', '/api/pages?limit=1000&depth=0&pagination=false&select[slug]=true&where[and][0][slug][not_equals]=home&where[and][1][_status][equals]=published')
  b('B29', 'app/(app)/wallet/page.tsx:29', 'buyer', '/api/wallets?limit=2&depth=0')
  b('B29+', 'app/(app)/wallet/page.tsx:32', 'buyer', `/api/wallet_ledger?where[user][equals]=${fx.buyerId}&limit=50&depth=0&sort=-createdAt`)
  b('B31', 'components/layout/search/Categories.tsx:11', 'anon', '/api/categories?limit=100&depth=1&sort=title')
  b('B32', 'components/layout/search/SoftwareTypes.tsx:11', 'anon', '/api/software_types?limit=100&depth=1&sort=sortOrder')
  b('B33', 'components/Header/index.tsx:9', 'anon', '/api/globals/header?depth=1')
  b('B33+', 'components/Footer/index.tsx:7', 'anon', '/api/globals/footer?depth=1')
  b('B34', 'services/commission.ts:125', 'anon', '/api/globals/commission_settings?depth=0')

  // ------------------------------------------------------------------ reported follow-ups (not gated)
  followups.push({ row: 'A3', ui: 'components/checkout/CheckoutPage.tsx:205-216', who: 'anon', method: '--', path: '(no request is issued)', expect: [], kind: 'existence', note: 'UI_UNWIRED: the VietQR branch reports a recorded order and calls nothing — reported for the product decision that owns it (task t7)' })
  followups.push({ row: 'A4', ui: 'components/checkout/CheckoutPage.tsx:127', who: 'buyer', method: 'POST', path: '/api/payments/stripe/initiate', json: {}, expect: [], kind: 'existence', note: 'decision 0013 keeps the Stripe dead end with the storefront vertical; its own task refuses the card rail instead of re-registering the route' })
  followups.push({ row: 'A5', ui: 'components/Cart/CartDrawer.tsx:60 + 5 more', who: 'buyer', method: 'GET', path: '/api/carts', expect: [], kind: 'existence', note: 'no carts collection (`carts: false`); decision 0014 moves the cart into the browser session — its own task owns that store' })

  return { rows, followups }
}

type Fixtures = {
  buyerId: number
  sellerId: number
  financeId: number
  moderatorId: number
  buyerOrderId: number | null
  foreignOrderId: number | null
  ownedProductId: number | null
  publishedProductId: number | null
  publishedProductSlug: string | null
  buyerIntentCode: string | null
  buyerTicketId: number | null
  buyerCommentId: number | null
  buyerCommentProductId: number | null
  buyerReviewProductId: number | null
}

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

const main = async (): Promise<void> => {
  console.log('=== UI↔API contract sweep (docs/plans/active/ui-api-integration.md) ===')
  console.log(`base      ${BASE}`)
  console.log(`run at    ${new Date().toISOString()}`)
  console.log(`password  scripts/seed-realistic.mts:701 (devPassword)${process.env.PROBE_DEV_PASSWORD ? ' [overridden by $PROBE_DEV_PASSWORD]' : ''}`)
  console.log('read-only no purchase, top-up, withdrawal, refund, comment, review, ticket, report, product or media write')
  console.log('')

  await login('buyer', BUYER_EMAIL)
  await login('seller', SELLER_EMAIL)
  await login('finance', FINANCE_EMAIL)
  await login('moderator', MODERATOR_EMAIL)

  // Fixtures, discovered read-only. The dev server and this script share the same DATABASE_URL.
  const payload = await getPayload({ config })
  const userByEmail = async (email: string): Promise<number> => {
    const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
    const id = idOf(found.docs[0])
    if (id === null) throw new Error(`seeded identity ${email} is missing; run scripts/seed-realistic.mts`)
    return id
  }

  const buyerId = await userByEmail(BUYER_EMAIL)
  const sellerId = await userByEmail(SELLER_EMAIL)
  const financeId = await userByEmail(FINANCE_EMAIL)
  const moderatorId = await userByEmail(MODERATOR_EMAIL)

  const buyerOrder = await payload.find({ collection: 'orders', where: { buyer: { equals: buyerId } }, limit: 1, sort: '-createdAt', depth: 0, overrideAccess: true })
  const foreignOrder = await payload.find({ collection: 'orders', where: { buyer: { not_equals: buyerId } }, limit: 1, sort: '-createdAt', depth: 0, overrideAccess: true })
  const entitlement = await payload.find({ collection: 'entitlements', where: { and: [{ user: { equals: buyerId } }, { status: { equals: 'active' } }] }, limit: 1, sort: '-createdAt', depth: 0, overrideAccess: true })
  const paidIntent = await payload.find({ collection: 'payment_intents', where: { and: [{ user: { equals: buyerId } }, { status: { equals: 'PAID' } }] }, limit: 1, sort: '-createdAt', depth: 0, overrideAccess: true })
  const anyIntent =
    paidIntent.docs.length > 0
      ? paidIntent
      : await payload.find({ collection: 'payment_intents', where: { user: { equals: buyerId } }, limit: 1, sort: '-createdAt', depth: 0, overrideAccess: true })
  const publishedProduct = await payload.find({ collection: 'products', where: { _status: { equals: 'published' } }, limit: 1, sort: '-createdAt', depth: 0, overrideAccess: true })
  const buyerTicket = await payload.find({ collection: 'tickets', where: { user: { equals: buyerId } }, limit: 1, sort: '-createdAt', depth: 0, overrideAccess: true })
  const buyerComment = await payload.find({ collection: 'comments', where: { user: { equals: buyerId } }, limit: 1, sort: '-createdAt', depth: 0, overrideAccess: true })
  const buyerReview = await payload.find({ collection: 'reviews', where: { user: { equals: buyerId } }, limit: 1, sort: '-createdAt', depth: 0, overrideAccess: true })

  const fx: Fixtures = {
    buyerId,
    sellerId,
    financeId,
    moderatorId,
    buyerOrderId: idOf(buyerOrder.docs[0]),
    foreignOrderId: idOf(foreignOrder.docs[0]),
    ownedProductId: entitlement.docs.length > 0 ? idOf((entitlement.docs[0] as { product?: unknown }).product) : null,
    publishedProductId: idOf(publishedProduct.docs[0]),
    publishedProductSlug: (publishedProduct.docs[0] as { slug?: string } | undefined)?.slug ?? null,
    buyerIntentCode: (anyIntent.docs[0] as { code?: string } | undefined)?.code ?? null,
    buyerTicketId: idOf(buyerTicket.docs[0]),
    buyerCommentId: idOf(buyerComment.docs[0]),
    buyerCommentProductId: buyerComment.docs.length > 0 ? idOf((buyerComment.docs[0] as { product?: unknown }).product) : null,
    buyerReviewProductId: buyerReview.docs.length > 0 ? idOf((buyerReview.docs[0] as { product?: unknown }).product) : null,
  }

  console.log(`identities buyer01=${buyerId} seller01=${sellerId} finance=${financeId} moderator=${moderatorId} (+ anon)`)
  console.log(`fixtures   order=${fx.buyerOrderId} foreignOrder=${fx.foreignOrderId} product=${fx.publishedProductId} owned=${fx.ownedProductId} intent=${fx.buyerIntentCode} ticket=${fx.buyerTicketId} comment=${fx.buyerCommentId} reviewProduct=${fx.buyerReviewProductId}`)
  console.log('')

  const { rows, followups } = buildRows(fx)
  const failures: Outcome[] = []
  const notFoundBranch: string[] = []
  let passed = 0

  console.log('--- A. client fetch() paths (the UI\'s own request shape) ---')
  for (const row of rows.filter((r) => /^A/.test(r.row))) {
    const outcome = await call(row)
    printOutcome(outcome)
    if (outcome.failure) failures.push(outcome)
    else if (outcome.status === 404) notFoundBranch.push(outcome.row.row)
    else passed += 1
  }

  console.log('')
  console.log('--- B. server components / Payload local API (REST equivalent of the same collection) ---')
  for (const row of rows.filter((r) => /^B/.test(r.row))) {
    const outcome = await call(row)
    printOutcome(outcome)
    if (outcome.failure) failures.push(outcome)
    else if (outcome.status === 404) notFoundBranch.push(outcome.row.row)
    else passed += 1
  }

  // ------------------------------------------------------------------ B30: repaired action, in-process
  console.log('')
  console.log('--- B30. repaired guest order-access email (in-process; transport stubbed, read-only) ---')
  const sent: Array<{ to?: unknown; html?: string }> = []
  const originalSendEmail = (payload as unknown as { sendEmail: unknown }).sendEmail
  ;(payload as unknown as { sendEmail: (args: unknown) => Promise<unknown> }).sendEmail = async (args: unknown) => {
    sent.push(args as { to?: unknown; html?: string })
    return args
  }

  const b30 = async (label: string, email: string, orderID: string, expectSend: boolean): Promise<void> => {
    sent.length = 0
    const result = await sendOrderAccessEmail({ email, orderID })
    const link = sent[0]?.html?.match(/href="([^"]+)"/)?.[1] ?? null
    const ok = result.success === true && (expectSend ? sent.length === 1 && link !== null && !/accessToken/.test(link) : sent.length === 0)
    console.log(
      `[ ${ok ? ' ok ' : 'FAIL'} ] B30    ${expectSend ? 'send' : 'miss'}  action   ` +
        `sends=${sent.length} to=${String(sent[0]?.to ?? '-')} link=${link ?? '-'}  (${label})`,
    )
    if (!ok) {
      failures.push({
        row: { row: 'B30', ui: 'components/forms/FindOrderForm/sendOrderAccessEmail.ts:24', who: 'anon', method: 'ACTION', path: label, expect: [200], kind: 'read' },
        status: null,
        body: JSON.stringify({ result, sends: sent.length }),
        failure: 'the repaired action did not behave as the row requires',
      })
    } else {
      passed += 1
    }
  }

  if (fx.buyerOrderId !== null) {
    await b30('buyer01 + own order', BUYER_EMAIL, String(fx.buyerOrderId), true)
    await b30('unknown email', 'probe-ui-api-contracts-nonexistent@example.com', String(fx.buyerOrderId), false)
  } else {
    skipped.push('B30: buyer01 has no order, so the send branch cannot be driven without creating one')
    console.log('[ skip ] B30    buyer01 has no order in this database; the send branch needs an existing one')
  }
  await b30('non-numeric order id', BUYER_EMAIL, 'khong-phai-so', false)
  if (fx.foreignOrderId !== null) {
    await b30("another buyer's order", BUYER_EMAIL, String(fx.foreignOrderId), false)
  }

  ;(payload as unknown as { sendEmail: unknown }).sendEmail = originalSendEmail

  // ------------------------------------------------------------------ follow-ups reported, not gated
  console.log('')
  console.log('--- reported follow-ups (owned by their own tasks; observed, not gated) ---')
  for (const follow of followups) {
    if (follow.method === '--') {
      console.log(`[report] ${align(follow.row, 7)} ${align('--', 4)} ${align(follow.path, 62)} ${follow.note ?? ''}`)
      continue
    }
    const outcome = await call(follow)
    console.log(`[report] ${align(follow.row, 7)} ${align(String(outcome.status), 4)} ${align(follow.method, 6)} ${align(follow.path, 62)} ${follow.note ?? ''}`)
    if (outcome.status !== 404) {
      console.log('         the follow-up appears resolved — update the plan Inventory before trusting this line')
    }
  }

  // ------------------------------------------------------------------ negative control
  // "0 failures" only means something if the sweep can actually fail: this row is a route that does
  // not exist, judged by the same function, and the run is green only when the detector catches it.
  console.log('')
  console.log('--- negative control (the detector must catch a dead end) ---')
  const control: Row = { row: 'CTRL', ui: '(not an inventory row)', who: 'anon', method: 'GET', path: '/api/v1/khong-ton-tai', expect: [200], kind: 'read' }
  const controlOutcome = await call(control)
  const controlCaught = controlOutcome.failure === "route missing (404 from Payload's catch-all)"
  console.log(
    `[ ${controlCaught ? ' ok ' : 'FAIL'} ] CTRL   ${align(String(controlOutcome.status), 4)} GET    ` +
      `${align(control.path, 62)} → ${controlOutcome.failure ?? 'no failure detected'}`,
  )
  if (!controlCaught) failures.push({ ...controlOutcome, failure: 'the missing-route detector did not fire' })

  // ------------------------------------------------------------------ integrity checks
  console.log('')
  console.log('--- integrity ---')
  let credentialOk = true
  try {
    await login('buyer', BUYER_EMAIL)
  } catch (error) {
    credentialOk = false
    console.log(`[ FAIL ] buyer01 can no longer log in after this run: ${(error as Error).message}`)
  }
  if (credentialOk) console.log("[  ok  ] buyer01's credential still works (the A42 probe re-applied the same password)")

  if (skipped.length > 0) {
    console.log('')
    console.log('--- rows with no read-only probe (printed, never silently dropped) ---')
    for (const line of skipped) console.log(`[ skip ] ${line}`)
  }

  console.log('')
  console.log(
    `=== ${passed} probes reached their expected branch, ${failures.length} failed, ` +
      `${notFoundBranch.length} exercised the row's documented not-found branch` +
      `${notFoundBranch.length > 0 ? ` (${notFoundBranch.join(', ')})` : ''}; ` +
      `${skipped.length} rows skipped with a reason; A3/A4/A5 reported as follow-ups ===`,
  )
  if (failures.length > 0) {
    console.log('failures:')
    for (const failure of failures) {
      console.log(`  ${failure.row.row} ${failure.row.method} ${failure.row.path} (${failure.row.who}) — ${failure.failure}`)
    }
  }

  // The Payload pool keeps the event loop alive, so the run ends the way the other probes in this
  // directory do: close the pool, then exit with the verdict. Without this the process hangs after
  // printing and any caller's timeout decides the exit code.
  const exitCode = failures.length > 0 || !credentialOk ? 1 : 0
  await payload.destroy()
  process.exit(exitCode)
}

main().catch(async (error) => {
  console.error(`\nprobe aborted: ${(error as Error).message}`)
  process.exit(1)
})
