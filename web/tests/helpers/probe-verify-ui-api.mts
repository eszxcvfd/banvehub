/**
 * Verifier instrument for task `t3` (ui-api-integration) — the independent UI↔API sweep.
 *
 * This file was written by `verifier`, not by the engineer. It does not import, call or reuse
 * `web/tests/helpers/probe-ui-api-contracts.mts`; every request below is derived from the call site
 * named in the row label (`file:line`, re-read from the working tree), and the assertion is about the
 * response the UI's own code reads.
 *
 * What it asserts, per probe:
 *   1. the status is one the UI's own error handling accepts;
 *   2. a 404 whose body is Payload's `Route not found` catch-all is a FAILURE (the UI's request shape
 *      must not hit a missing route) — except for the probe explicitly marked `expectRouteMissing`;
 *   3. any 5xx is a FAILURE;
 *   4. every field path in `want` is present in the JSON body (`a.b.c`, arrays as `a.0.b`);
 *   5. `absent` field paths are NOT present.
 *
 * It is read-only except for the probes whose id ends in `+write`, which are named individually in the
 * report and cleaned up by `.lit/evidence/verifier-t3/probes/cleanup-residue.mts`.
 *
 * Run: NODE_OPTIONS=--no-deprecation node --import tsx/esm web/tests/helpers/probe-verify-ui-api.mts
 * from the repository root (or `web/`), against a dev server on :3000 (override with PROBE_BASE).
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const REPORT = process.env.PROBE_REPORT ?? ''
const PASSWORD = process.env.PROBE_PASSWORD ?? 'KienTao@2026'

// ---------------------------------------------------------------------------------------------
// fixtures (measured in this run, see probes/report for the queries)
// ---------------------------------------------------------------------------------------------
const F = {
  buyer: 'buyer01@kientaohub.vn',
  seller: 'seller01@kientaohub.vn',
  finance: 'finance@kientaohub.vn',
  moderator: 'moderator@kientaohub.vn',
  buyerId: 9,
  sellerId: 4,
  productOwned: 158, // buyer01 holds an active entitlement (row A2/A10/A11/A12/A13)
  productOwned2: 159,
  productFree: 157,
  productUnowned: 156, // published, 650,000₫, buyer01 holds no entitlement
  productSellerOwn: 157, // seller = user 4 (seller01) → self-purchase gate
  orderOwned: 349, // buyer01, COMPLETED
  orderPending: 227, // buyer01, PENDING → refund ineligible
  notification: 112, // buyer01
}

// ---------------------------------------------------------------------------------------------
// transport
// ---------------------------------------------------------------------------------------------
type Resp = {
  status: number
  body: any
  text: string
  contentType: string
  cookieHeader: string
  method: string
  path: string
  identity: string
}

const cookies: Record<string, string> = {}

const extractCookie = (res: Response): string => {
  const anyHeaders = res.headers as any
  const list: string[] = typeof anyHeaders.getSetCookie === 'function' ? anyHeaders.getSetCookie() : []
  const raw = list.length > 0 ? list : [res.headers.get('set-cookie') ?? '']
  for (const entry of raw) {
    const match = /(^|[,\s])payload-token=([^;]+)/.exec(entry || '')
    if (match) return `payload-token=${match[2]}`
  }
  return ''
}

async function login(key: string, email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const cookie = extractCookie(res)
  if (!cookie) throw new Error(`login failed for ${email}: ${res.status}`)
  cookies[key] = cookie
  return cookie
}

type RequestInitish = {
  jar?: string | null
  body?: unknown
  rawBody?: string
  form?: FormData
  headers?: Record<string, string>
  contentType?: string | null
}

async function req(method: string, path: string, init: RequestInitish = {}): Promise<Resp> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) }
  let body: BodyInit | undefined

  if (init.form) {
    body = init.form
  } else if (init.rawBody !== undefined) {
    body = init.rawBody
    headers['Content-Type'] = init.contentType ?? 'application/json'
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body)
    headers['Content-Type'] = init.contentType ?? 'application/json'
  }

  const jar = init.jar === undefined ? null : init.jar
  if (jar && cookies[jar]) headers['Cookie'] = cookies[jar]

  const res = await fetch(`${BASE}${path}`, { method, headers, body, redirect: 'manual' })
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return {
    status: res.status,
    body: parsed,
    text,
    contentType: res.headers.get('content-type') ?? '',
    cookieHeader: extractCookie(res),
    method,
    path,
    identity: jar ?? 'anonymous',
  }
}

// ---------------------------------------------------------------------------------------------
// assertions
// ---------------------------------------------------------------------------------------------
const substitutePlaceholders = (value: unknown, name: string): unknown => {
  if (value === '__NAME__') return name
  if (Array.isArray(value)) return value.map((entry) => substitutePlaceholders(entry, name))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, substitutePlaceholders(entry, name)]))
  }
  return value
}

const getPath = (value: any, path: string): { found: boolean; value: any } => {
  const parts = path.split('.')
  let cursor = value
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return { found: false, value: undefined }
    if (Array.isArray(cursor)) {
      const index = Number(part)
      if (!Number.isInteger(index) || index >= cursor.length) return { found: false, value: undefined }
      cursor = cursor[index]
      continue
    }
    if (typeof cursor !== 'object' || !(part in cursor)) return { found: false, value: undefined }
    cursor = cursor[part]
  }
  return { found: true, value: cursor }
}

const isRouteMissing = (r: Resp): boolean =>
  r.status === 404 && typeof r.body?.message === 'string' && /Route not found/i.test(r.body.message)

type Probe = {
  id: string
  label: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  jar: string | null
  body?: unknown
  rawBody?: string
  form?: () => FormData
  expect: number[]
  want?: string[]
  absent?: string[]
  expectRouteMissing?: boolean
  note?: string
}

type Result = {
  probe: Probe
  resp: Resp
  problems: string[]
  found: Record<string, boolean>
}

const probes: Probe[] = []
const P = (probe: Probe) => probes.push(probe)

// =============================================================================================
// A. client fetch() paths
// =============================================================================================

// A1 / A7 — GET /api/v1/me/wallet (CheckoutPage.tsx:85, WalletClient.tsx:191)
P({ id: 'A1', label: 'CheckoutPage.tsx:85 GET /api/v1/me/wallet (reads data.wallet)', method: 'GET', path: '/api/v1/me/wallet', jar: 'buyer', expect: [200], want: ['success', 'wallet.balance', 'wallet.pendingBalance', 'wallet.currency', 'wallet.status'] })
P({ id: 'A1-anon', label: 'same, anonymous → the route 401s (UI: res.ok ? json : null)', method: 'GET', path: '/api/v1/me/wallet', jar: null, expect: [401], want: ['error'] })

// A2 / A13 — POST /api/v1/orders/purchase (CheckoutPage.tsx:180, DigitalProductCTA.tsx:312)
P({ id: 'A2', label: 'POST /api/v1/orders/purchase {productId:158} as owner → 409 ALREADY_OWNED (UI reads error/message/entitlementId)', method: 'POST', path: '/api/v1/orders/purchase', jar: 'buyer', body: { productId: F.productOwned }, expect: [409], want: ['error', 'message', 'entitlementId'] })
P({ id: 'A2-anon', label: 'purchase anonymous → 401 {error,message}', method: 'POST', path: '/api/v1/orders/purchase', jar: null, body: { productId: F.productOwned }, expect: [401], want: ['error', 'message'] })
P({ id: 'A2-bad', label: 'purchase {} → 400 (UI reads data.message on !res.ok)', method: 'POST', path: '/api/v1/orders/purchase', jar: 'buyer', body: {}, expect: [400], want: ['error', 'message'] })
P({ id: 'A13-self', label: 'purchase seller01 own product → 400 SELF_PURCHASE_FORBIDDEN (DigitalProductCTA.tsx:352 branch)', method: 'POST', path: '/api/v1/orders/purchase', jar: 'seller', body: { productId: F.productSellerOwn }, expect: [400], want: ['error', 'message'] })

// A3 / A6 — POST /api/v1/payments/topup (CheckoutPage.tsx:222, WalletClient.tsx:167)
P({ id: 'A3-bad', label: 'topup {amount:9999} → 400 (UI renders data.message/error)', method: 'POST', path: '/api/v1/payments/topup', jar: 'buyer', body: { amount: 9999 }, expect: [400], want: ['error'] })
P({ id: 'A3-anon', label: 'topup anonymous → 401 {error}', method: 'POST', path: '/api/v1/payments/topup', jar: null, body: { amount: 50000 }, expect: [401], want: ['error'] })
P({ id: 'A6+write', label: 'topup {amount:50000} → 200 {success,intent{code,amount,status,checkoutUrl,bankCode,accountNo,accountName,expiresAt}} (creates ONE intent, cleaned up)', method: 'POST', path: '/api/v1/payments/topup', jar: 'buyer', body: { amount: 50000 }, expect: [200], want: ['success', 'intent.code', 'intent.amount', 'intent.status', 'intent.checkoutUrl', 'intent.bankCode', 'intent.accountNo', 'intent.accountName', 'intent.expiresAt'] })

// A4 — card branch: POST /api/v1/payments/card/initiate (CheckoutPage.tsx:136)
P({ id: 'A4', label: 'card initiate (buyer) → 501 {error,message}; UI renders data.message||data.error', method: 'POST', path: '/api/v1/payments/card/initiate', jar: 'buyer', body: { amount: 430000 }, expect: [501], want: ['error', 'message'] })
P({ id: 'A4-anon', label: 'card initiate anonymous → still a deterministic 501 (stateless), never 404/500', method: 'POST', path: '/api/v1/payments/card/initiate', jar: null, body: { amount: 1 }, expect: [501], want: ['error', 'message'] })
P({ id: 'A4-dead', label: 'the removed plugin route POST /api/payments/stripe/initiate → 404 route-missing (no longer called by the UI)', method: 'POST', path: '/api/payments/stripe/initiate', jar: 'buyer', body: {}, expect: [404], expectRouteMissing: true, note: 'decision 0013 removed it; recorded here so the dead end is not silently re-wired' })

// A5 — cart: the plugin's /api/carts must be unreachable AND unused (decision 0014)
P({ id: 'A5', label: 'GET /api/carts → 404 route-missing (no carts collection); the cart path must not call it', method: 'GET', path: '/api/carts', jar: 'buyer', expect: [404], expectRouteMissing: true })

// A8 — GET /api/v1/me/wallet/ledger?limit=50 (WalletClient.tsx:192)
P({ id: 'A8', label: 'GET /api/v1/me/wallet/ledger?limit=50 (buyer) → 200 {success,docs,totalDocs}; the table renders direction/amount/referenceId/balanceAfter/description', method: 'GET', path: '/api/v1/me/wallet/ledger?limit=50', jar: 'buyer', expect: [200], want: ['success', 'docs', 'totalDocs', 'docs.0.direction', 'docs.0.amount', 'docs.0.balanceAfter'] })
P({ id: 'A8-anon', label: 'ledger anonymous → 401 {error}', method: 'GET', path: '/api/v1/me/wallet/ledger?limit=50', jar: null, expect: [401], want: ['error'] })

// A9 — GET /api/v1/payments/{code} (WalletClient.tsx:128 resume, :215 poll)
P({ id: 'A9-unknown', label: 'GET /api/v1/payments/KHONG-TON-TAI (buyer) → 404 {error}', method: 'GET', path: '/api/v1/payments/KHONG-TON-TAI', jar: 'buyer', expect: [404], want: ['error'] })
P({ id: 'A9-anon', label: 'GET /api/v1/payments/{owner code} anonymous → 401 (was 200 before t2)', method: 'GET', path: '/api/v1/payments/__CODE__', jar: null, expect: [401], want: ['error'] })
P({ id: 'A9-owner', label: 'GET /api/v1/payments/{owner code} as its owner → 200 {success,intent.status,amount,code,…}', method: 'GET', path: '/api/v1/payments/__CODE__', jar: 'buyer', expect: [200], want: ['success', 'intent.code', 'intent.status', 'intent.amount', 'intent.bankCode', 'intent.accountNo', 'intent.accountName', 'intent.expiresAt'] })
P({ id: 'A9-foreign-seller', label: 'GET another buyer’s code as seller01 → 404 with the unknown-code body', method: 'GET', path: '/api/v1/payments/__CODE__', jar: 'seller', expect: [404], want: ['error'] })
P({ id: 'A9-foreign-mod', label: 'GET another buyer’s code as moderator → 404', method: 'GET', path: '/api/v1/payments/__CODE__', jar: 'moderator', expect: [404], want: ['error'] })
P({ id: 'A9-finance', label: 'GET another buyer’s code as financeAdmin → 200 (collection rule allows admin/financeAdmin)', method: 'GET', path: '/api/v1/payments/__CODE__', jar: 'finance', expect: [200], want: ['success', 'intent.code'] })

// A10 / A12 — POST /api/v1/downloads/token (DownloadButton.tsx:50, DigitalProductCTA.tsx:250)
P({ id: 'A10+write', label: 'downloads/token {productId:158} owner → 200 {success,data.downloadUrl} (records a download event)', method: 'POST', path: '/api/v1/downloads/token', jar: 'buyer', body: { productId: F.productOwned }, expect: [200], want: ['success', 'data.downloadUrl'] })
P({ id: 'A10-bad', label: 'downloads/token {} → 400 {error,message}; UI renders data.message', method: 'POST', path: '/api/v1/downloads/token', jar: 'buyer', body: {}, expect: [400], want: ['error', 'message'] })
P({ id: 'A10-unowned', label: 'downloads/token {productId:156} not owned → 403 {error,message}', method: 'POST', path: '/api/v1/downloads/token', jar: 'buyer', body: { productId: F.productUnowned }, expect: [403], want: ['error', 'message'] })
P({ id: 'A12-anon', label: 'downloads/token anonymous → 401 {error,message}; DigitalProductCTA maps 401 to the login modal', method: 'POST', path: '/api/v1/downloads/token', jar: null, body: { productId: F.productOwned }, expect: [401], want: ['error', 'message'] })

// A11 — GET /api/v1/me/entitlements?productId= (DigitalProductCTA.tsx:120, :191)
P({ id: 'A11', label: 'entitlements?productId=158 owner → 200 {hasEntitlement:true,isAuthenticated,docs}', method: 'GET', path: `/api/v1/me/entitlements?productId=${F.productOwned}`, jar: 'buyer', expect: [200], want: ['success', 'isAuthenticated', 'hasEntitlement', 'docs'] })
P({ id: 'A11-anon', label: 'entitlements anonymous → 200 {isAuthenticated:false,hasEntitlement:false,docs:[]}', method: 'GET', path: `/api/v1/me/entitlements?productId=${F.productOwned}`, jar: null, expect: [200], want: ['success', 'isAuthenticated', 'hasEntitlement', 'docs'] })
P({ id: 'A11-bad', label: 'entitlements?productId=abc → 400 {error,message}', method: 'GET', path: '/api/v1/me/entitlements?productId=abc', jar: 'buyer', expect: [400], want: ['error', 'message'] })

// A14 — GET /api/v1/products/159/comments?page=1&limit=10 (ProductCommentsSection.tsx:129)
P({ id: 'A14', label: 'comments?page=1&limit=10 (public) → 200 {success,comments,totalComments,pagination.totalPages,pagination.page}', method: 'GET', path: `/api/v1/products/${F.productOwned2}/comments?page=1&limit=10`, jar: null, expect: [200], want: ['success', 'comments', 'totalComments', 'pagination.totalPages', 'pagination.page'] })
// A15 / A16 — POST comments (ProductCommentsSection.tsx:171, :211)
P({ id: 'A15-bad', label: 'POST comments {content:"ab"} → 400 (UI renders data.message)', method: 'POST', path: `/api/v1/products/${F.productOwned2}/comments`, jar: 'buyer', body: { content: 'ab' }, expect: [400], want: ['error', 'message'] })
P({ id: 'A15-anon', label: 'POST comments anonymous → 401 {error,message}', method: 'POST', path: `/api/v1/products/${F.productOwned2}/comments`, jar: null, body: { content: 'verifier probe' }, expect: [401], want: ['error', 'message'] })
// A17 — PATCH comments/{id} (ProductCommentsSection.tsx:244)
P({ id: 'A17', label: 'PATCH comments/999999 {status:hidden} buyer → 404 (documented not-found branch; fixture absent)', method: 'PATCH', path: `/api/v1/products/${F.productOwned2}/comments/999999`, jar: 'buyer', body: { status: 'hidden' }, expect: [404], want: ['error', 'message'] })
// A18 — GET reviews (ProductReviewsSection.tsx:136, :167)
P({ id: 'A18', label: 'reviews?page=1&limit=6 (public) → 200 {success,summary,reviews,pagination,userReview,canReview}', method: 'GET', path: `/api/v1/products/${F.productOwned2}/reviews?page=1&limit=6`, jar: null, expect: [200], want: ['success', 'summary', 'reviews', 'pagination', 'userReview', 'canReview'] })
// A19 — POST/PUT reviews (ProductReviewsSection.tsx:219)
P({ id: 'A19-bad', label: 'POST reviews {rating:0} → 400 (UI renders data.message)', method: 'POST', path: `/api/v1/products/${F.productOwned2}/reviews`, jar: 'buyer', body: { rating: 0, title: '', content: '' }, expect: [400], want: ['error', 'message'] })
P({ id: 'A19-anon', label: 'POST reviews anonymous → 401 (UI maps 401 to a login prompt)', method: 'POST', path: `/api/v1/products/${F.productOwned2}/reviews`, jar: null, body: { rating: 5, content: 'x' }, expect: [401], want: ['error', 'message'] })
// A20 — POST reports (ProductReportDialog.tsx:72)
P({ id: 'A20-bad', label: 'POST reports {reason:COUNTERFEIT} → 400 INVALID_REASON (UI renders data.message)', method: 'POST', path: `/api/v1/products/${F.productOwned2}/reports`, jar: 'buyer', body: { reason: 'COUNTERFEIT', description: '' }, expect: [400], want: ['error', 'message'] })
P({ id: 'A20-anon', label: 'POST reports anonymous → 401 {error,message}', method: 'POST', path: `/api/v1/products/${F.productOwned2}/reports`, jar: null, body: { reason: 'FILE_CORRUPTED' }, expect: [401], want: ['error', 'message'] })
// A21 — POST /api/v1/tickets (OrderDisputeModal.tsx:102)
P({ id: 'A21-bad', label: 'POST tickets {reason:BOGUS} → 400 (UI renders data.message)', method: 'POST', path: '/api/v1/tickets', jar: 'buyer', body: { orderId: F.orderOwned, productId: F.productOwned, reason: 'BOGUS', subject: 'x', description: 'y', priority: 'MEDIUM' }, expect: [400], want: ['error'] })
P({ id: 'A21-anon', label: 'POST tickets anonymous → 401 {error,message}', method: 'POST', path: '/api/v1/tickets', jar: null, body: { orderId: F.orderOwned, reason: 'DOWNLOAD_ERROR', subject: 'x', description: 'y' }, expect: [401], want: ['error', 'message'] })
// A22 — POST /api/v1/tickets/{id}/messages (OrderTicketsSection.tsx:111)
P({ id: 'A22', label: 'POST tickets/999999/messages {message} → 404 {error,message}', method: 'POST', path: '/api/v1/tickets/999999/messages', jar: 'buyer', body: { message: 'verifier probe' }, expect: [404], want: ['error', 'message'] })
// A23 — PATCH /api/v1/tickets/{id} (OrderTicketsSection.tsx:137)
P({ id: 'A23', label: 'PATCH tickets/999999 {status:CLOSED} → 404 {error,message}', method: 'PATCH', path: '/api/v1/tickets/999999', jar: 'buyer', body: { status: 'CLOSED' }, expect: [404], want: ['error', 'message'] })
// A24 / A25 — notifications (NotificationsList.tsx:147, :171)
P({ id: 'A24', label: 'POST me/notifications/112/read (owner) → 200 {success,id,isRead,readAt,updated}', method: 'POST', path: `/api/v1/me/notifications/${F.notification}/read`, jar: 'buyer', expect: [200], want: ['success', 'id', 'isRead', 'readAt', 'updated'] })
P({ id: 'A24-404', label: 'POST me/notifications/999999/read → 404 {error,message} (UI renders data.message)', method: 'POST', path: '/api/v1/me/notifications/999999/read', jar: 'buyer', expect: [404], want: ['error', 'message'] })
P({ id: 'A24-anon', label: 'POST me/notifications/112/read anonymous → 401 {error,message}', method: 'POST', path: `/api/v1/me/notifications/${F.notification}/read`, jar: null, expect: [401], want: ['error', 'message'] })
P({ id: 'A25', label: 'POST me/notifications/read-all → 200 {success,unreadCount,updated}', method: 'POST', path: '/api/v1/me/notifications/read-all', jar: 'buyer', expect: [200], want: ['success', 'unreadCount', 'updated'] })
P({ id: 'A25-anon', label: 'read-all anonymous → 401 {error,message}', method: 'POST', path: '/api/v1/me/notifications/read-all', jar: null, expect: [401], want: ['error', 'message'] })

// A26-A30 — /api/v1/admin/withdrawals/{id}/** (FinanceOperations.tsx:118,141,178,209,233)
const withdrawalPosts: Array<[string, string, unknown]> = [
  ['A26', 'review', undefined],
  ['A27', 'approve', { notes: 'verifier probe — not-found id, no write' }],
  ['A28', 'reject', { reason: 'verifier probe' }],
  ['A29', 'process', undefined],
  ['A30', 'finalize', undefined],
]
for (const [id, action, body] of withdrawalPosts) {
  P({ id, label: `POST /api/v1/admin/withdrawals/999999/${action} (finance) → 400 {error,message} (UI renders data.message||data.error)`, method: 'POST', path: `/api/v1/admin/withdrawals/999999/${action}`, jar: 'finance', body: body as any, expect: [400], want: ['error', 'message'] })
  P({ id: `${id}-role`, label: `POST /api/v1/admin/withdrawals/999999/${action} (buyer) → 403 (decision 0008 gate)`, method: 'POST', path: `/api/v1/admin/withdrawals/999999/${action}`, jar: 'buyer', body: body as any, expect: [403], want: ['error'] })
  P({ id: `${id}-anon`, label: `POST /api/v1/admin/withdrawals/999999/${action} (anonymous) → 401`, method: 'POST', path: `/api/v1/admin/withdrawals/999999/${action}`, jar: null, body: body as any, expect: [401], want: ['error'] })
}

// A31 — POST /api/v1/admin/refunds (FinanceOperations.tsx:314)
P({ id: 'A31-bad', label: 'POST admin/refunds {} (finance) → 400 {error,message}', method: 'POST', path: '/api/v1/admin/refunds', jar: 'finance', body: {}, expect: [400], want: ['error', 'message'] })
P({ id: 'A31-window', label: 'POST admin/refunds {orderId:227,…} ineligible order → 400 {error,message}', method: 'POST', path: '/api/v1/admin/refunds', jar: 'finance', body: { orderId: F.orderPending, reason: 'verifier probe', faultBasis: 'SELLER_FAULT', revokeEntitlement: false }, expect: [400], want: ['error', 'message'] })
P({ id: 'A31-role', label: 'POST admin/refunds (buyer) → 403', method: 'POST', path: '/api/v1/admin/refunds', jar: 'buyer', body: { orderId: F.orderOwned, reason: 'x', faultBasis: 'SELLER_FAULT' }, expect: [403], want: ['error'] })
P({ id: 'A31-anon', label: 'POST admin/refunds anonymous → 401', method: 'POST', path: '/api/v1/admin/refunds', jar: null, body: {}, expect: [401], want: ['error'] })
// A32 — GET /api/v1/admin/refunds (FinanceOperations.tsx:353)
P({ id: 'A32', label: 'GET admin/refunds (finance) → 200 {success,docs,totalDocs}', method: 'GET', path: '/api/v1/admin/refunds', jar: 'finance', expect: [200], want: ['success', 'docs', 'totalDocs'] })
P({ id: 'A32-role', label: 'GET admin/refunds (seller) → 403 {error,message}', method: 'GET', path: '/api/v1/admin/refunds', jar: 'seller', expect: [403], want: ['error'] })

// A33 — POST /api/moderation/action (ModerationQueue.tsx:70)
P({ id: 'A33-bad', label: 'POST moderation/action {productId:159,action:bogus} (moderator) → 400 {error}', method: 'POST', path: '/api/moderation/action', jar: 'moderator', body: { productId: F.productOwned2, action: 'bogus', note: 'x' }, expect: [400], want: ['error'] })
P({ id: 'A33-role', label: 'POST moderation/action (buyer) → 403 {error} (decision 0008)', method: 'POST', path: '/api/moderation/action', jar: 'buyer', body: { productId: F.productOwned2, action: 'approved', note: '' }, expect: [403], want: ['error'] })
P({ id: 'A33-anon', label: 'POST moderation/action anonymous → 403 {error}', method: 'POST', path: '/api/moderation/action', jar: null, body: { productId: F.productOwned2, action: 'approved' }, expect: [403], want: ['error'] })

// A34 — POST /api/seller/register (RegisterForm.tsx:40)
P({ id: 'A34-bad', label: 'POST seller/register {} (buyer) → 400 {error}', method: 'POST', path: '/api/seller/register', jar: 'buyer', body: {}, expect: [400], want: ['error'] })
P({ id: 'A34-anon', label: 'POST seller/register anonymous → 401 {error}', method: 'POST', path: '/api/seller/register', jar: null, body: { displayName: 'x' }, expect: [401], want: ['error'] })
// A35 — POST /api/v1/seller/withdrawals (WithdrawalModal.tsx:85)
P({ id: 'A35-cap', label: 'POST seller/withdrawals over the 50M cap (seller) → 400 {error,message}', method: 'POST', path: '/api/v1/seller/withdrawals', jar: 'seller', body: { amount: 99999999, bankInfo: { bankName: 'VCB', accountNumber: '1', accountHolderName: 'x' } }, expect: [400], want: ['error', 'message'] })
P({ id: 'A35-bad', label: 'POST seller/withdrawals {} → 400 {error,message}', method: 'POST', path: '/api/v1/seller/withdrawals', jar: 'seller', body: {}, expect: [400], want: ['error', 'message'] })
P({ id: 'A35-role', label: 'POST seller/withdrawals (buyer) → 403', method: 'POST', path: '/api/v1/seller/withdrawals', jar: 'buyer', body: { amount: 100000, bankInfo: { bankName: 'VCB', accountNumber: '1', accountHolderName: 'x' } }, expect: [403], want: ['error'] })
// A36 — POST /api/v1/seller/withdrawals/{id}/cancel (WithdrawalHistoryTable.tsx:87)
P({ id: 'A36', label: 'POST seller/withdrawals/999999/cancel (seller, no body) → 400 {error,message}', method: 'POST', path: '/api/v1/seller/withdrawals/999999/cancel', jar: 'seller', expect: [400], want: ['error', 'message'] })
P({ id: 'A36-role', label: 'POST seller/withdrawals/999999/cancel (buyer) → 403', method: 'POST', path: '/api/v1/seller/withdrawals/999999/cancel', jar: 'buyer', expect: [403], want: ['error'] })

// A37 — POST /api/seller/upload-preview (ProductEditorModal.tsx:89, ProductEditorForm.tsx:62)
P({ id: 'A37-bad', label: 'upload-preview with the file part sent as a string → 400 {error} (was 500 before t2)', method: 'POST', path: '/api/seller/upload-preview', jar: 'seller', form: () => { const f = new FormData(); f.append('file', 'not-a-file'); f.append('title', 'probe'); return f }, expect: [400], want: ['error'] })
P({ id: 'A37-role', label: 'upload-preview (buyer) → 403 {error}', method: 'POST', path: '/api/seller/upload-preview', jar: 'buyer', form: () => { const f = new FormData(); f.append('file', new Blob([Buffer.from('x')], { type: 'image/png' }), 'x.png'); return f }, expect: [403], want: ['error'] })
// A38 — POST /api/seller/upload-file (ProductEditorModal.tsx:116, ProductEditorForm.tsx:91)
P({ id: 'A38-bad', label: 'upload-file with the file part sent as a string → 400 {error} (was 500 before t2)', method: 'POST', path: '/api/seller/upload-file', jar: 'seller', form: () => { const f = new FormData(); f.append('file', 'not-a-file'); return f }, expect: [400], want: ['error'] })
P({ id: 'A38-role', label: 'upload-file (buyer) → 403 {error}', method: 'POST', path: '/api/seller/upload-file', jar: 'buyer', form: () => { const f = new FormData(); f.append('file', new Blob([Buffer.from('x')], { type: 'application/pdf' }), 'x.pdf'); return f }, expect: [403], want: ['error'] })
// A39 — POST /api/seller/products (ProductEditorModal.tsx:181, ProductEditorForm.tsx:129)
P({ id: 'A39-bad', label: 'POST seller/products {} (seller) → 400 {error}', method: 'POST', path: '/api/seller/products', jar: 'seller', body: {}, expect: [400], want: ['error'] })
P({ id: 'A39-role', label: 'POST seller/products (buyer) → 403 {error}', method: 'POST', path: '/api/seller/products', jar: 'buyer', body: { title: 'verifier probe' }, expect: [403], want: ['error'] })

// A40 — the address book: POST /api/addresses (AddressForm → plugin useAddresses) and DELETE /api/addresses/{id}
//      (AddressListing.tsx:68). The create path is *not* an inventory row — it was re-derived here and it
//      does not hold: the form's own default (AddressForm/index.tsx:78 `country: 'VN'`) is not a member of
//      the collection's country select, so the UI cannot save its default address.
P({ id: 'A40-create-vn', label: 'FINDING: POST /api/addresses with the form’s own default body (country:"VN") → 400 invalid Country', method: 'POST', path: '/api/addresses', jar: 'buyer', body: { firstName: 'Verifier', lastName: 'Probe', phone: '0912345678', company: null, addressLine1: 'verifier probe', addressLine2: null, city: 'Hà Nội', state: null, postalCode: '100000', country: 'VN' }, expect: [400], want: ['errors.0.message'], note: 'AddressForm/index.tsx:78 defaults country to VN; the collection select holds the plugin defaultCountries list (no VN). A40-create-us shows the same body with the form’s second option succeeds.' })
P({ id: 'A40-create-us', label: 'POST /api/addresses with the same body and the form’s second option (country:"US") → 201 {doc} (proves the body shape is the collection’s)', method: 'POST', path: '/api/addresses', jar: 'buyer', body: { firstName: 'Verifier', lastName: 'Probe', phone: '0912345678', company: null, addressLine1: 'verifier probe', addressLine2: null, city: 'Hà Nội', state: null, postalCode: '100000', country: 'US' }, expect: [201], want: ['doc.id'] })
P({ id: 'A40-anon', label: 'DELETE /api/addresses/1 anonymous → 403 (Payload collection rule)', method: 'DELETE', path: '/api/addresses/1', jar: null, expect: [403] })
P({ id: 'A40-foreign', label: 'DELETE another customer’s address (id 1, owner differs) with the buyer cookie → 403', method: 'DELETE', path: '/api/addresses/1', jar: 'buyer', expect: [403] })
P({ id: 'A40+write', label: 'DELETE the address this run created (buyer, own row) → 200 {doc} (UI only reads response.ok)', method: 'DELETE', path: '/api/addresses/__ADDRESS__', jar: 'buyer', expect: [200], want: ['doc'] })

// A41 / A42 — PATCH /api/users/{id} (AccountForm/index.tsx:81, :125)
P({ id: 'A41', label: 'PATCH /api/users/9 {name,email} (buyer, own row, same values) → 200 {doc} (UI reads json.doc)', method: 'PATCH', path: `/api/users/${F.buyerId}`, jar: 'buyer', body: { name: '__NAME__', email: F.buyer }, expect: [200], want: ['doc'] })
P({ id: 'A41-role', label: 'PATCH /api/users/4 (seller’s row) with the buyer cookie → 403 {errors[0].message}', method: 'PATCH', path: `/api/users/${F.sellerId}`, jar: 'buyer', body: { name: 'verifier probe' }, expect: [403], want: ['errors.0.message'] })
P({ id: 'A42', label: 'PATCH /api/users/9 {password} (buyer, re-applies its own current password) → 200 {doc}', method: 'PATCH', path: `/api/users/${F.buyerId}`, jar: 'buyer', body: { password: PASSWORD, passwordConfirm: PASSWORD }, expect: [200], want: ['doc'] })
// A43 — POST /api/users (CreateAccountForm/index.tsx:84)
P({ id: 'A43-bad', label: 'POST /api/users with a duplicate email → 400 {errors[0].message} (UI reads that key first)', method: 'POST', path: '/api/users', jar: null, body: { email: F.buyer, password: PASSWORD, passwordConfirm: PASSWORD }, expect: [400], want: ['errors.0.message'] })
// A44 — POST /api/users/forgot-password (ForgotPasswordForm/index.tsx:46)
P({ id: 'A44', label: 'POST /api/users/forgot-password {email} → 200 {message} (UI only branches on res.ok)', method: 'POST', path: '/api/users/forgot-password', jar: null, body: { email: F.buyer }, expect: [200], want: ['message'] })

// =============================================================================================
// B. server components / local API: REST equivalent of the same collection + the same identity
// =============================================================================================
const B = (probe: Omit<Probe, 'label'> & { label: string }) => P(probe as Probe)

// B1 / B6 — orders.find (own 5 / own 100)
B({ id: 'B1', label: 'GET /api/orders where[buyer]=9 (buyer) → 200 docs,totalDocs (orderReadAccess narrowing)', method: 'GET', path: `/api/orders?limit=5&depth=0&sort=-createdAt&where[buyer][equals]=${F.buyerId}`, jar: 'buyer', expect: [200], want: ['docs', 'totalDocs', 'docs.0.code'] })
B({ id: 'B1-anon', label: 'GET /api/orders anonymous → 403 (orderReadAccess denies guests)', method: 'GET', path: '/api/orders?limit=2&depth=0', jar: null, expect: [403] })
B({ id: 'B3-foreign', label: 'GET /api/orders/240 (another buyer’s order: buyer 43) with the buyer cookie → denied (404 Not Found body), so the page’s catch → notFound()', method: 'GET', path: '/api/orders/240?depth=0', jar: 'buyer', expect: [403, 404] })
B({ id: 'B6', label: 'GET /api/orders where[buyer]=9 limit=100 depth=2 (buyer) → 200 docs', method: 'GET', path: `/api/orders?limit=100&depth=2&sort=-createdAt&where[buyer][equals]=${F.buyerId}`, jar: 'buyer', expect: [200], want: ['docs', 'totalDocs'] })
// B2 — notifications (inbox + unread count)
B({ id: 'B2', label: 'GET /api/notifications where[recipient]=9 limit=50 (buyer) → 200 docs,totalDocs', method: 'GET', path: `/api/notifications?limit=50&depth=0&sort=-createdAt&where[recipient][equals]=${F.buyerId}`, jar: 'buyer', expect: [200], want: ['docs', 'totalDocs'] })
B({ id: 'B2b', label: 'GET /api/notifications where[and][recipient,readAt exists=false] limit=1 → 200 totalDocs', method: 'GET', path: `/api/notifications?limit=1&depth=0&where[and][0][recipient][equals]=${F.buyerId}&where[and][1][readAt][exists]=false`, jar: 'buyer', expect: [200], want: ['totalDocs'] })
// B3 — order detail
B({ id: 'B3', label: 'GET /api/orders/349 depth=2 (buyer) → 200 doc with code', method: 'GET', path: `/api/orders/${F.orderOwned}?depth=2`, jar: 'buyer', expect: [200], want: ['id', 'code'] })
// B4 / B5 — order items and tickets for that order
B({ id: 'B4', label: 'GET /api/order_items where[order]=349 depth=2 → 200 docs', method: 'GET', path: `/api/order_items?where[order][equals]=${F.orderOwned}&depth=2&limit=100`, jar: 'buyer', expect: [200], want: ['docs'] })
B({ id: 'B5', label: 'GET /api/tickets where[order]=349 depth=2 → 200 docs', method: 'GET', path: `/api/tickets?where[order][equals]=${F.orderOwned}&sort=-createdAt&depth=2`, jar: 'buyer', expect: [200], want: ['docs'] })
// B7 / B8 — pages
B({ id: 'B7', label: 'GET /api/pages draft=false limit=1000 pagination=false select[slug] (anon) → 200 docs', method: 'GET', path: '/api/pages?draft=false&limit=1000&pagination=false&select[slug]=true', jar: null, expect: [200], want: ['docs'] })
B({ id: 'B8', label: 'GET /api/pages where[and][slug=home,_status=published] limit=1 → 200 docs', method: 'GET', path: '/api/pages?draft=false&limit=1&pagination=false&where[and][0][slug][equals]=home&where[and][1][_status][equals]=published', jar: null, expect: [200], want: ['docs'] })
// B9 / B10 / B11 — finance console
B({ id: 'B9', label: 'GET /api/withdrawals sort=-requestedAt limit=100 depth=1 (finance) → 200 docs,docs.0.code', method: 'GET', path: '/api/withdrawals?sort=-requestedAt&limit=100&depth=1', jar: 'finance', expect: [200], want: ['docs', 'totalDocs', 'docs.0.code'] })
B({ id: 'B9-buyer', label: 'GET /api/withdrawals (buyer) → 200 but narrowed to seller=9 (docs []) — the collection rule, not the page gate', method: 'GET', path: '/api/withdrawals?limit=100&depth=0', jar: 'buyer', expect: [200], want: ['docs'] })
B({ id: 'B10', label: 'GET /api/refunds sort=-createdAt limit=100 depth=1 (finance) → 200 docs', method: 'GET', path: '/api/refunds?sort=-createdAt&limit=100&depth=1', jar: 'finance', expect: [200], want: ['docs', 'totalDocs'] })
B({ id: 'B11', label: 'GET /api/orders limit=100 depth=0 (finance, all orders) → 200 docs,totalDocs', method: 'GET', path: '/api/orders?sort=-createdAt&limit=100&depth=0', jar: 'finance', expect: [200], want: ['docs', 'totalDocs'] })
// B12 — moderation queue
B({ id: 'B12', label: 'GET /api/products where[moderationStatus][in]=submitted,in_review (moderator) → 200 docs', method: 'GET', path: '/api/products?where[moderationStatus][in][0]=submitted&where[moderationStatus][in][1]=in_review&limit=100&depth=2&sort=createdAt', jar: 'moderator', expect: [200], want: ['docs', 'totalDocs'] })
// B13 / B14 — home + product detail
B({ id: 'B13', label: 'GET /api/products limit=5 depth=1 draft=false where[_status]=published (anon) → 200 docs', method: 'GET', path: '/api/products?limit=5&depth=1&draft=false&where[_status][equals]=published', jar: null, expect: [200], want: ['docs'] })
B({ id: 'B14', label: 'GET /api/products where[slug]=san-pham-159… limit=1 depth=3 (anon) → 200 docs', method: 'GET', path: '/api/products?where[slug][equals]=san-pham-159-ban-ve-canh-quan-san-vuon&limit=1&depth=3&draft=false', jar: null, expect: [200], want: ['docs', 'docs.0.title'] })
// B15-B19 — seller dashboard
B({ id: 'B15', label: 'GET /api/seller_profiles where[user]=4 limit=1 (seller) → 200 docs', method: 'GET', path: `/api/seller_profiles?where[user][equals]=${F.sellerId}&limit=1&overrideAccess=true`, jar: 'seller', expect: [200], want: ['docs', 'docs.0.displayName'] })
B({ id: 'B16', label: 'GET /api/withdrawals where[seller]=4 (seller) → 200 docs', method: 'GET', path: `/api/withdrawals?where[seller][equals]=${F.sellerId}&sort=-createdAt&limit=50`, jar: 'seller', expect: [200], want: ['docs'] })
B({ id: 'B17', label: 'GET /api/seller_earnings where[seller]=4 limit=1000 depth=1 (seller) → 200 docs', method: 'GET', path: `/api/seller_earnings?where[seller][equals]=${F.sellerId}&limit=1000&depth=1`, jar: 'seller', expect: [200], want: ['docs'] })
B({ id: 'B18', label: 'GET /api/products where[seller]=4 limit=100 (seller) → 200 docs', method: 'GET', path: `/api/products?where[seller][equals]=${F.sellerId}&sort=-createdAt&limit=100`, jar: 'seller', expect: [200], want: ['docs'] })
B({ id: 'B19', label: 'GET /api/categories limit=100 pagination=false (seller) → 200 docs', method: 'GET', path: '/api/categories?limit=100&pagination=false&depth=0', jar: 'seller', expect: [200], want: ['docs'] })
B({ id: 'B19b', label: 'GET /api/software_types limit=100 pagination=false (seller) → 200 docs', method: 'GET', path: '/api/software_types?limit=100&pagination=false&depth=0', jar: 'seller', expect: [200], want: ['docs'] })
B({ id: 'B19c', label: 'GET /api/tags limit=100 pagination=false (seller) → 200 docs', method: 'GET', path: '/api/tags?limit=100&pagination=false&depth=0', jar: 'seller', expect: [200], want: ['docs'] })
// B20 — seller register gate
B({ id: 'B20', label: 'GET /api/seller_profiles where[user]=9 limit=1 (buyer, no profile) → 200 docs []', method: 'GET', path: `/api/seller_profiles?where[user][equals]=${F.buyerId}&limit=1`, jar: 'buyer', expect: [200], want: ['docs'] })
// B21 / B22 / B23 — shop landing + keyword redirects
B({ id: 'B21', label: 'GET /api/categories where[slug] limit=1 select[title,slug,description] (anon) → 200 docs[0].title', method: 'GET', path: '/api/categories?where[slug][equals]=ban-ve-canh-quan-san-vuon&limit=1&select[title]=true&select[slug]=true&select[description]=true', jar: null, expect: [200], want: ['docs.0.title', 'docs.0.slug'] })
B({ id: 'B22', label: 'GET /api/software_types where[slug] limit=1 select[title,slug] (anon) → 200 docs[0].title', method: 'GET', path: '/api/software_types?where[slug][equals]=pdf-vector&limit=1&select[title]=true&select[slug]=true', jar: null, expect: [200], want: ['docs.0.title', 'docs.0.slug'] })
B({ id: 'B23', label: 'GET /api/categories where[or][title like|slug like] limit=50 select[slug] (anon) → 200 docs', method: 'GET', path: '/api/categories?where[or][0][title][like]=canh&where[or][1][slug][like]=canh&limit=50&select[slug]=true', jar: null, expect: [200], want: ['docs'] })
// B24 / B25 — shop grid + sitemap products
B({ id: 'B24', label: 'GET /api/products limit=12 depth=1 where[_status]=published (anon) → 200 docs,totalDocs', method: 'GET', path: '/api/products?limit=12&depth=1&where[_status][equals]=published', jar: null, expect: [200], want: ['docs', 'totalDocs'] })
B({ id: 'B25', label: 'GET /api/products draft=false limit=1000 pagination=false where[_status]=published select[slug] → 200 docs', method: 'GET', path: '/api/products?draft=false&limit=1000&pagination=false&where[_status][equals]=published&select[slug]=true', jar: null, expect: [200], want: ['docs'] })
// B26 / B27 / B28 — sitemap categories / software types / pages
B({ id: 'B26', label: 'GET /api/categories where[or][status=active|status exists=false] select[slug] → 200 docs', method: 'GET', path: '/api/categories?limit=1000&pagination=false&where[or][0][status][equals]=active&where[or][1][status][exists]=false&select[slug]=true', jar: null, expect: [200], want: ['docs'] })
B({ id: 'B27', label: 'GET /api/software_types limit=1000 pagination=false select[slug] → 200 docs', method: 'GET', path: '/api/software_types?limit=1000&pagination=false&select[slug]=true', jar: null, expect: [200], want: ['docs'] })
B({ id: 'B28', label: 'GET /api/pages where[and][slug not_equals home,_status published] select[slug] → 200 docs', method: 'GET', path: '/api/pages?draft=false&limit=1000&pagination=false&where[and][0][slug][not_equals]=home&where[and][1][_status][equals]=published&select[slug]=true', jar: null, expect: [200], want: ['docs'] })
// B29 — wallet page local reads
B({ id: 'B29', label: 'GET /api/wallet_ledger where[user]=9 sort=-createdAt limit=50 (buyer) → 200 docs', method: 'GET', path: `/api/wallet_ledger?where[user][equals]=${F.buyerId}&sort=-createdAt&limit=50&depth=0`, jar: 'buyer', expect: [200], want: ['docs'] })
B({ id: 'B29b', label: 'GET /api/wallets limit=2 (buyer) → 200 docs', method: 'GET', path: '/api/wallets?limit=2&depth=0', jar: 'buyer', expect: [200], want: ['docs'] })
B({ id: 'B29-anon', label: 'GET /api/wallets anonymous → 403 (walletReadAccess)', method: 'GET', path: '/api/wallets?limit=2&depth=0', jar: null, expect: [403] })
// B30 — find-order: the action is public/anonymous, and the read it performs is denied to guests unless overridden
B({ id: 'B30-rest', label: 'GET /api/orders where[accessToken] anonymous → 403 (the rule the guest action must bypass deliberately)', method: 'GET', path: '/api/orders?where[accessToken][equals]=probe&limit=1&depth=0', jar: null, expect: [403] })
// B31 / B32 / B33 / B34 — public nav/globals
B({ id: 'B31', label: 'GET /api/categories (anon) → 200 docs', method: 'GET', path: '/api/categories?sort=title&limit=100', jar: null, expect: [200], want: ['docs'] })
B({ id: 'B32', label: 'GET /api/software_types (anon) → 200 docs', method: 'GET', path: '/api/software_types?sort=sortOrder&limit=100', jar: null, expect: [200], want: ['docs'] })
B({ id: 'B33', label: 'GET /api/globals/header depth=1 (anon) → 200 navItems', method: 'GET', path: '/api/globals/header?depth=1', jar: null, expect: [200], want: ['navItems'] })
B({ id: 'B33b', label: 'GET /api/globals/footer depth=1 (anon) → 200 navItems', method: 'GET', path: '/api/globals/footer?depth=1', jar: null, expect: [200], want: ['navItems'] })
B({ id: 'B34', label: 'GET /api/globals/commission_settings depth=0 → 200 defaultRate', method: 'GET', path: '/api/globals/commission_settings?depth=0', jar: null, expect: [200], want: ['defaultRate'] })

// =============================================================================================
// controls — prove the harness can fail and that "route missing" is detected
// =============================================================================================
P({ id: 'CTRL-route-missing', label: 'GET /api/v1/khong-ton-tai → 404 route-missing, expected (negative control for the detector)', method: 'GET', path: '/api/v1/khong-ton-tai', jar: null, expect: [404], expectRouteMissing: true })

// ---------------------------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------------------------
async function main() {
  const started = Date.now()
  await login('buyer', F.buyer)
  await login('seller', F.seller)
  await login('finance', F.finance)
  await login('moderator', F.moderator)

  // ---- fixtures resolved at run time -------------------------------------------------------
  const meRes = await req('GET', `/api/users/${F.buyerId}?depth=0`, { jar: 'buyer' })
  const buyerName = meRes.body?.name ?? meRes.body?.doc?.name ?? ''
  const meDoc = meRes.body?.doc ?? meRes.body

  // one top-up intent, created through the UI's own route and reused across A6/A9 probes
  let intentCode = ''
  const topup = await req('POST', '/api/v1/payments/topup', { jar: 'buyer', body: { amount: 50000 } })
  intentCode = topup.body?.intent?.code ?? ''

  // one address through Payload's own route with the UI's exact body (AddressForm) then DELETE it with
  // the UI's own call — the round trip leaves nothing behind.
  const uiAddressBody = {
    firstName: 'Verifier',
    lastName: 'Probe',
    phone: '0912345678',
    company: null,
    addressLine1: 'verifier probe (run-scoped, deleted below)',
    addressLine2: null,
    city: 'Hà Nội',
    state: null,
    postalCode: '100000',
    country: 'US',
  }
  const addressPost = await req('POST', '/api/addresses', { jar: 'buyer', body: uiAddressBody })
  const addressId = addressPost.body?.doc?.id

  const resolved = probes.map((p) => {
    let path = p.path
    let body = p.body
    if (path.includes('__CODE__')) path = path.replace('__CODE__', encodeURIComponent(intentCode || 'MISSING'))
    if (path.includes('__ADDRESS__')) path = path.replace('__ADDRESS__', String(addressId ?? 999999))
    if (body !== undefined) body = substitutePlaceholders(body, buyerName)
    return { ...p, path, body }
  })

  const results: Result[] = []
  for (const probe of resolved) {
    let resp: Resp
    try {
      resp = await req(probe.method, probe.path, {
        jar: probe.jar,
        body: probe.body,
        rawBody: probe.rawBody,
        form: probe.form ? probe.form() : undefined,
      })
    } catch (error: any) {
      resp = { status: 0, body: null, text: String(error?.message ?? error), contentType: '', cookieHeader: '', method: probe.method, path: probe.path, identity: probe.jar ?? 'anonymous' }
    }

    const problems: string[] = []
    const found: Record<string, boolean> = {}

    if (resp.status === 0) problems.push(`transport error: ${resp.text}`)
    // 5xx is a failure unless the row's own contract *is* a server-side refusal it documents (the card
    // rail's deterministic 501).
    if (resp.status >= 500 && !probe.expect.includes(resp.status)) problems.push(`5xx: ${resp.status}`)
    const routeMissing = isRouteMissing(resp)
    if (routeMissing && !probe.expectRouteMissing) problems.push('route missing (404 Route not found)')
    if (!routeMissing && !probe.expect.includes(resp.status)) {
      problems.push(`status ${resp.status} not in UI-accepted [${probe.expect.join(',')}]`)
    }
    for (const path of probe.want ?? []) {
      const { found: present } = getPath(resp.body, path)
      found[path] = present
      if (!present) problems.push(`missing field ${path}`)
    }
    for (const path of probe.absent ?? []) {
      const { found: present } = getPath(resp.body, path)
      found[path] = !present
      if (present) problems.push(`unexpected field present: ${path}`)
    }

    results.push({ probe, resp, problems, found })
  }

  // ---- identity check: the run must leave buyer01's display name as it found it -----------------
  const identityAfter = await req('GET', `/api/users/${F.buyerId}?depth=0`, { jar: 'buyer' })
  const nameAfter = identityAfter.body?.name ?? identityAfter.body?.doc?.name ?? ''
  const identityProblems = nameAfter === buyerName ? [] : [`buyer01 name changed by the run: "${buyerName}" → "${nameAfter}"`]
  if (identityProblems.length > 0) {
    await req('PATCH', `/api/users/${F.buyerId}`, { jar: 'buyer', body: { name: buyerName } })
  }

  // ---- self-check: the assertion engine must be able to fail ---------------------------------
  const selfCheck = await req('GET', '/api/v1/me/wallet', { jar: 'buyer' })
  const selfProblems: string[] = []
  const impossible = getPath(selfCheck.body, 'wallet.definitelyNotAField')
  if (impossible.found) selfProblems.push('field getter returned found for a nonexistent path')

  // ---- residue cleanup for what this run created --------------------------------------------
  const cleanup: string[] = []
  const extraAddress = results.find((r) => r.probe.id === 'A40-create-us')
  const extraAddressId = getPath(extraAddress?.resp.body, 'doc.id').value
  if (extraAddressId) {
    const del = await req('DELETE', `/api/addresses/${extraAddressId}`, { jar: 'buyer' })
    cleanup.push(`DELETE /api/addresses/${extraAddressId} (created by A40-create-us) → ${del.status}`)
  }

  // ---- report -------------------------------------------------------------------------------
  const lines: string[] = []
  const push = (line = '') => {
    lines.push(line)
    console.log(line)
  }
  const failed = results.filter((r) => r.problems.length > 0)
  const writeProbes = results.filter((r) => r.probe.id.includes('+write'))

  push(`verifier sweep — base=${BASE} — ${new Date().toISOString()}`)
  push('')
  push(`fixtures: buyer=${F.buyerId} seller=${F.sellerId} finance=${F.finance} moderator=${F.moderator}; productOwned=${F.productOwned} productUnowned=${F.productUnowned}; order=${F.orderOwned}; notification=${F.notification}`)
  push(`run-scoped: intent=${intentCode || 'NOT CREATED'} address=${addressId ?? 'NOT CREATED'}; buyer name on record="${buyerName}" (from ${meDoc ? 'doc' : '?'})`)
  push(`run cleanup: ${cleanup.join('; ') || 'nothing to clean'}`)
  push(`probes: ${results.length} (write probes named for cleanup: ${writeProbes.map((r) => r.probe.id).join(', ') || 'none'})`)
  push('')
  push('--- per-probe results -----------------------------------------------------------------')
  for (const r of results) {
    const status = r.problems.length === 0 ? ' ok ' : 'FAIL'
    const fields = Object.entries(r.found)
      .map(([k, v]) => `${k}=${v ? 'present' : 'MISSING'}`)
      .join(' ')
    const bodyKeys = r.resp.body && typeof r.resp.body === 'object' ? Object.keys(r.resp.body).slice(0, 8).join(',') : r.resp.text.slice(0, 60)
    push(`[${status}] ${r.probe.id.padEnd(18)} ${r.probe.method.padEnd(6)} ${r.probe.path}`)
    push(`         identity=${r.resp.identity.padEnd(10)} status=${r.resp.status} bodyKeys=[${bodyKeys}]`)
    push(`         ${r.probe.label}`)
    if (fields) push(`         fields: ${fields}`)
    if (r.problems.length > 0) push(`         PROBLEMS: ${r.problems.join('; ')}`)
    push('')
  }

  push('--- summary -------------------------------------------------------------------------')
  push(`total probes: ${results.length}`)
  push(`passed: ${results.length - failed.length}`)
  push(`failed: ${failed.length}`)
  for (const r of failed) push(`  FAIL ${r.probe.id}: ${r.problems.join('; ')}`)
  push(`route-missing detected for: ${results.filter((r) => isRouteMissing(r.resp)).map((r) => r.probe.id).join(', ')}`)
  push(`self-check (field getter must not find a nonexistent path): ${selfProblems.length === 0 ? 'ok' : `FAIL ${selfProblems.join(';')}`}`)
  push(`identity check (buyer01 display name unchanged by the run): ${identityProblems.length === 0 ? 'ok' : `FAIL ${identityProblems.join(';')} (restored)`}`)
  push(`duration: ${Math.round((Date.now() - started) / 1000)}s`)

  if (REPORT) {
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(
      REPORT,
      JSON.stringify(
        {
          base: BASE,
          ranAt: new Date().toISOString(),
          fixtures: F,
          intentCode,
          addressId,
          selfCheckProblems: selfProblems,
          results: results.map((r) => ({
            id: r.probe.id,
            label: r.probe.label,
            method: r.probe.method,
            path: r.probe.path,
            identity: r.resp.identity,
            status: r.resp.status,
            bodyKeys: r.resp.body && typeof r.resp.body === 'object' ? Object.keys(r.resp.body) : null,
            problems: r.problems,
            found: r.found,
          })),
        },
        null,
        2,
      ),
    )
  }

  const ok = failed.length === 0 && selfProblems.length === 0 && identityProblems.length === 0
  console.log(ok ? 'SWEEP: PASS' : 'SWEEP: FAIL')
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error('probe crashed:', error)
  process.exit(2)
})
