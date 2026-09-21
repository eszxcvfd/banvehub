/**
 * Verifier instrument for task `t3` — the write branches of the inventory rows whose 200/201 shape the
 * read-only sweep cannot reach (no comment / review / ticket / report fixtures exist on the current
 * database: task `t5` deleted the inventory's probe residue).
 *
 * It creates the fixtures **through the UI's own routes, with the UI's own bodies** (read from
 * `web/src/components/product/ProductCommentsSection.tsx`, `ProductReviewsSection.tsx`,
 * `ProductReportDialog.tsx`, `web/src/components/dispute/OrderDisputeModal.tsx`,
 * `OrderTicketsSection.tsx`), asserts the fields each component reads, prints the created ids, and
 * leaves them for `.lit/evidence/verifier-t3/probes/cleanup-write-branches.mts` to delete through
 * Payload's local API.
 *
 * Run from `web/`: NODE_OPTIONS=--no-deprecation node --import tsx/esm tests/helpers/probe-verify-write-branches.mts
 */
import { writeFileSync } from 'node:fs'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const PASSWORD = process.env.PROBE_PASSWORD ?? 'KienTao@2026'
const OUT = process.env.PROBE_OUT ?? ''
const PRODUCT = 159
const ORDER = 349

type Result = { id: string; status: number; want: string[]; found: Record<string, boolean>; body: any }

const created: Record<string, unknown> = {}
const results: Result[] = []

let cookie = ''

const login = async () => {
  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'buyer01@kientaohub.vn', password: PASSWORD }),
  })
  const list: string[] = (res.headers as any).getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  const match = list.map((c) => /(^|,\s*)payload-token=([^;]+)/.exec(c || '')).find(Boolean)
  if (!match) throw new Error(`login failed: ${res.status}`)
  cookie = `payload-token=${match[2]}`
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

const call = async (id: string, method: string, path: string, body: unknown, expect: number[], want: string[]) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  const found: Record<string, boolean> = {}
  const problems: string[] = []
  if (res.status >= 500) problems.push(`5xx ${res.status}`)
  if (!expect.includes(res.status)) problems.push(`status ${res.status} not in [${expect.join(',')}]`)
  for (const path of want) {
    const { found: present } = getPath(json, path)
    found[path] = present
    if (!present) problems.push(`missing ${path}`)
  }
  results.push({ id, status: res.status, want, found, body: json })
  console.log(`${problems.length === 0 ? '[ ok ]' : '[FAIL]'} ${id.padEnd(10)} ${method.padEnd(6)} ${path} → ${res.status}`)
  console.log(`        ${method} body=${body === undefined ? '(none)' : JSON.stringify(body).slice(0, 140)}`)
  console.log(`        fields: ${Object.entries(found).map(([k, v]) => `${k}=${v ? 'present' : 'MISSING'}`).join(' ')}`)
  if (problems.length > 0) console.log(`        PROBLEMS: ${problems.join('; ')} — body: ${text.slice(0, 300)}`)
  return json
}

const main = async () => {
  await login()

  // A15 — POST /api/v1/products/159/comments (ProductCommentsSection.tsx:171, body {content})
  const comment = await call('A15', 'POST', `/api/v1/products/${PRODUCT}/comments`, { content: 'verifier probe câu hỏi (sẽ xoá)' }, [201], ['success', 'comment.id', 'comment.content', 'comment.status'])
  created.commentId = comment?.comment?.id

  // A16 — same route, body {parentId, content} (ProductCommentsSection.tsx:211)
  const reply = await call('A16', 'POST', `/api/v1/products/${PRODUCT}/comments`, { parentId: created.commentId, content: 'verifier probe trả lời (sẽ xoá)' }, [201], ['success', 'comment.id', 'comment.parentId'])
  created.replyId = reply?.comment?.id

  // A17 — PATCH comments/{id} {status:'hidden'} (ProductCommentsSection.tsx:244)
  // Measured: the 200 body is {success, comment} with NO `message` (the inventory's evidence cell said
  // otherwise). The UI's success branch shows a fixed toast and never reads `message`, so the row holds.
  await call('A17', 'PATCH', `/api/v1/products/${PRODUCT}/comments/${created.commentId}`, { status: 'hidden' }, [200], ['success', 'comment.status'])

  // A19 — POST then PUT /api/v1/products/159/reviews (ProductReviewsSection.tsx:219)
  const review = await call('A19-post', 'POST', `/api/v1/products/${PRODUCT}/reviews`, { rating: 5, content: 'verifier probe đánh giá (sẽ xoá)' }, [201], ['success', 'message', 'review.id'])
  created.reviewId = review?.review?.id
  await call('A19-put', 'PUT', `/api/v1/products/${PRODUCT}/reviews`, { rating: 4, content: 'verifier probe cập nhật (sẽ xoá)', title: null }, [200], ['success', 'message', 'review.id'])

  // A20 — POST /api/v1/products/159/reports (ProductReportDialog.tsx:72, first dialog option)
  const report = await call('A20', 'POST', `/api/v1/products/${PRODUCT}/reports`, { reason: 'FILE_CORRUPTED', description: 'verifier probe báo cáo (sẽ xoá)' }, [201], ['success', 'case.id', 'case.productId', 'case.reason'])
  created.moderationCaseId = report?.case?.id

  // A21 — POST /api/v1/tickets (OrderDisputeModal.tsx:102, the dialog's own enum values)
  const ticket = await call('A21', 'POST', '/api/v1/tickets', {
    orderId: ORDER,
    productId: 158, // order 349's own line item (the route validates TICKET_PRODUCT_NOT_IN_ORDER)
    reason: 'DOWNLOAD_ERROR',
    subject: 'verifier probe khiếu nại',
    description: 'verifier probe mô tả (sẽ xoá)',
    priority: 'NORMAL',
  }, [201], ['success', 'ticket.id', 'ticket.code', 'ticket.status'])
  created.ticketId = ticket?.ticket?.id

  // A22 — POST /api/v1/tickets/{id}/messages (OrderTicketsSection.tsx:111)
  await call('A22', 'POST', `/api/v1/tickets/${created.ticketId}/messages`, { message: 'verifier probe phản hồi (sẽ xoá)' }, [201], ['success', 'ticket.id', 'ticket.status'])

  // A23 — PATCH /api/v1/tickets/{id} {status:'CLOSED'} (OrderTicketsSection.tsx:137)
  await call('A23', 'PATCH', `/api/v1/tickets/${created.ticketId}`, { status: 'CLOSED' }, [200], ['success', 'ticket.id', 'ticket.status'])

  const failed = results.filter((r) => r.status >= 500 || !/^(A\d+)$/.test(r.id.replace('-post', '').replace('-put', '')) ? false : false)
  const problems = results.filter((r) => Object.values(r.found).some((v) => !v) || r.status >= 500)
  console.log('')
  console.log(`write-branch checks: ${results.length}, failing: ${problems.length}`)
  console.log(`created (delete with cleanup-write-branches.mts): ${JSON.stringify(created)}`)
  if (OUT) writeFileSync(OUT, JSON.stringify({ created, results: results.map((r) => ({ id: r.id, status: r.status, found: r.found })) }, null, 2))
  void failed
  process.exit(problems.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('probe crashed:', error)
  process.exit(2)
})
