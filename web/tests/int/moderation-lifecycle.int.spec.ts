import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Product, User } from '@/payload-types'

describe('Product Moderation Lifecycle (FLOW-U11, FLOW-U14, FR-28, BR-08)', () => {
  let payload: Payload

  let adminUser: User
  let moderatorUser: User
  let sellerUser: User

  const cleanup = {
    products: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-moderation-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })
    cleanup.users.push(user.id)
    return user
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    const timestamp = Date.now()
    adminUser = await createUser(`admin-mod-flow-${timestamp}@kientaohub.local`, ['admin'])
    moderatorUser = await createUser(`mod-mod-flow-${timestamp}@kientaohub.local`, ['moderator'])
    sellerUser = await createUser(`seller-mod-flow-${timestamp}@kientaohub.local`, ['seller'])
  })

  afterAll(async () => {
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch (err) {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (err) {}
    }
  })

  it('allows a seller to create a draft product', async () => {
    const product = await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: `Seller Draft Asset ${getSeq()}`,
        slug: `seller-draft-${Date.now()}-${getSeq()}`,
        price: 250000,
        isFree: false,
        technicalSpecs: {
          fileFormat: '.dwg',
          softwareVersion: 'AutoCAD 2023',
          unit: 'metric',
        },
      },
      overrideAccess: false,
      user: sellerUser,
    })
    cleanup.products.push(product.id)

    expect(product.id).toBeDefined()
    expect(product._status).toBe('draft')
    expect(product.moderationStatus).toBe('draft')
  })

  it('rejects submission if seller has not confirmed copyright declaration', async () => {
    await expect(
      payload.create({
        collection: 'products',
        data: {
          title: `Unverified CAD Blueprint ${getSeq()}`,
          slug: `unverified-cad-${Date.now()}-${getSeq()}`,
          price: 150000,
          moderationStatus: 'submitted',
          copyrightDeclared: false, // Invalid
        },
        overrideAccess: false,
        user: sellerUser,
      }),
    ).rejects.toThrow(/bản quyền/)
  })

  it('allows a seller to submit a product for review with copyright declaration', async () => {
    const product = await payload.create({
      collection: 'products',
      data: {
        title: `Revit Hospital MEP Blueprint ${getSeq()}`,
        slug: `revit-hosp-${Date.now()}-${getSeq()}`,
        price: 500000,
        isFree: false,
        copyrightDeclared: true,
        moderationStatus: 'submitted',
        technicalSpecs: {
          fileFormat: '.rvt',
          softwareVersion: 'Revit 2024',
          fileSize: '120 MB',
          unit: 'metric',
        },
      },
      overrideAccess: false,
      user: sellerUser,
    })
    cleanup.products.push(product.id)

    expect(product.id).toBeDefined()
    expect(product.moderationStatus).toBe('submitted')
    expect(product._status).toBe('draft') // Locked to draft until moderator approves!
    expect(product.copyrightDeclared).toBe(true)

    // Verify draft isolation: public guest cannot see it in catalog
    const guestSearch = await payload.find({
      collection: 'products',
      where: {
        id: { equals: product.id },
      },
      overrideAccess: false,
      user: null,
    })
    expect(guestSearch.totalDocs).toBe(0)
  })

  it('blocks seller from self-publishing or self-approving a submitted product (BR-08, FR-28)', async () => {
    const submittedProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Asset Waiting Review ${getSeq()}`,
        slug: `asset-waiting-${Date.now()}-${getSeq()}`,
        price: 300000,
        copyrightDeclared: true,
        moderationStatus: 'submitted',
      },
      overrideAccess: true,
    })
    cleanup.products.push(submittedProduct.id)

    // Seller attempts to self-approve
    await expect(
      payload.update({
        collection: 'products',
        id: submittedProduct.id,
        data: {
          moderationStatus: 'approved',
        },
        overrideAccess: false,
        user: sellerUser,
      }),
    ).rejects.toThrow()

    // Seller attempts to self-publish directly
    await expect(
      payload.update({
        collection: 'products',
        id: submittedProduct.id,
        data: {
          _status: 'published',
        },
        overrideAccess: false,
        user: sellerUser,
      }),
    ).rejects.toThrow()
  })

  it('allows moderator to request changes with feedback notes, returning product to draft', async () => {
    const product = await payload.create({
      collection: 'products',
      data: {
        title: `Needs Revision Model ${getSeq()}`,
        slug: `needs-rev-${Date.now()}-${getSeq()}`,
        price: 200000,
        copyrightDeclared: true,
        moderationStatus: 'submitted',
      },
      overrideAccess: true,
    })
    cleanup.products.push(product.id)

    const updated = await payload.update({
      collection: 'products',
      id: product.id,
      data: {
        moderationStatus: 'changes_requested',
        moderationNotes: 'Ảnh preview bị mờ, vui lòng tải lên ảnh phối cảnh độ phân giải cao hơn.',
      },
      overrideAccess: false,
      user: moderatorUser,
    })

    expect(updated.moderationStatus).toBe('changes_requested')
    expect(updated._status).toBe('draft')
    expect(updated.moderationNotes).toContain('Ảnh preview bị mờ')
    expect(updated.moderationHistory?.length).toBeGreaterThan(0)
  })

  it('allows moderator to approve product, which automatically publishes to public catalog', async () => {
    const product = await payload.create({
      collection: 'products',
      data: {
        title: `Approved Masterpiece Model ${getSeq()}`,
        slug: `appr-model-${Date.now()}-${getSeq()}`,
        price: 450000,
        isFree: false,
        copyrightDeclared: true,
        moderationStatus: 'submitted',
      },
      overrideAccess: true,
    })
    cleanup.products.push(product.id)

    const approved = await payload.update({
      collection: 'products',
      id: product.id,
      data: {
        moderationStatus: 'approved',
      },
      overrideAccess: false,
      user: moderatorUser,
    })

    expect(approved.moderationStatus).toBe('approved')
    expect(approved._status).toBe('published')
    expect(approved.moderationHistory?.some((h) => h.action === 'approved')).toBe(true)

    // Verify public catalog visibility
    const guestQuery = await payload.find({
      collection: 'products',
      where: {
        id: { equals: product.id },
      },
      overrideAccess: false,
      user: null,
    })
    expect(guestQuery.totalDocs).toBe(1)
    expect(guestQuery.docs[0].id).toBe(product.id)
  })
})
