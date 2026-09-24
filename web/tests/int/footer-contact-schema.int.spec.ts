import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Decision 0012 §2 and its phase-12 migration: the `footer` global carries the operator's public
 * contact channel, and the columns the operator edits in the admin panel are the ones the
 * storefront renders.
 *
 * This spec proves the runtime round-trip through Payload (write then read, not raw SQL), because
 * the migration's column names and the global's field names are only correct together — and the
 * parallel UI team renders exactly these fields. The footer is restored afterwards so the suite
 * leaves no fixture behind and a spec that asserts the unset state is unaffected.
 */
describe('Decision 0012 §2: the footer global carries the operator contact channel', () => {
  let payload: Payload
  let original: {
    contactEmail?: string | null
    contactPhone?: string | null
    contactNote?: string | null
  } = {}

  beforeAll(async () => {
    payload = await getPayload({ config })
    const footer = await payload.findGlobal({ slug: 'footer', overrideAccess: true })
    original = {
      contactEmail: footer.contactEmail ?? null,
      contactPhone: footer.contactPhone ?? null,
      contactNote: footer.contactNote ?? null,
    }
  })

  afterAll(async () => {
    if (!payload) return
    await payload.updateGlobal({
      slug: 'footer',
      data: original,
      overrideAccess: true,
    })
  })

  it('persists the operator contact email, phone and note, and reads them back publicly', async () => {
    const stamp = Date.now()
    const email = `ho-tro-${stamp}@kientaohub.local`
    const phone = '+84 900 000 000'
    const note = 'Hỗ trợ 8:00-17:00. Yêu cầu hoàn tiền gửi qua các kênh liên hệ này.'

    await payload.updateGlobal({
      slug: 'footer',
      data: { contactEmail: email, contactPhone: phone, contactNote: note },
      overrideAccess: true,
    })

    const read = await payload.findGlobal({ slug: 'footer', overrideAccess: true })
    expect(read.contactEmail).toBe(email)
    expect(read.contactPhone).toBe(phone)
    expect(read.contactNote).toBe(note)

    // The footer's read access is public (`() => true`), which is what lets the storefront render
    // the contact channel to a buyer who is not signed in.
    const publicRead = await payload.findGlobal({ slug: 'footer' })
    expect(publicRead.contactEmail).toBe(email)
    expect(publicRead.contactPhone).toBe(phone)
    expect(publicRead.contactNote).toBe(note)
  })
})
