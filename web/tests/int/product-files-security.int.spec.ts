import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProductFile, User } from '@/payload-types'

describe('Private Product Files Security & Checksum (BR-06, Decision 0006, FR-27)', () => {
  let payload: Payload

  let adminUser: User
  let moderatorUser: User
  let sellerA: User
  let sellerB: User
  let buyerUser: User

  const cleanup = {
    productFiles: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-files-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })
    cleanup.users.push(user.id)
    return user
  }

  const createProductFileHelper = async (sellerId: number, filename: string, user?: any, overrideAccess: boolean = true) => {
    const content = Buffer.from(`CAD_DATA_${Date.now()}_${getSeq()}`)
    const fileDoc = await payload.create({
      collection: 'product_files',
      data: {
        seller: sellerId,
        originalFilename: filename,
        fileFormat: filename.includes('.') ? `.${filename.split('.').pop()}` : '.dwg',
      },
      file: {
        data: content,
        name: filename,
        mimetype: 'application/octet-stream',
        size: content.length,
      },
      overrideAccess,
      user,
    })
    cleanup.productFiles.push(fileDoc.id)
    return fileDoc
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    const timestamp = Date.now()
    adminUser = await createUser(`admin-files-${timestamp}@kientaohub.local`, ['admin'])
    moderatorUser = await createUser(`mod-files-${timestamp}@kientaohub.local`, ['moderator'])
    sellerA = await createUser(`seller-a-files-${timestamp}@kientaohub.local`, ['seller'])
    sellerB = await createUser(`seller-b-files-${timestamp}@kientaohub.local`, ['seller'])
    buyerUser = await createUser(`buyer-files-${timestamp}@kientaohub.local`, ['buyer'])
  })

  afterAll(async () => {
    for (const id of cleanup.productFiles) {
      try {
        await payload.delete({ collection: 'product_files', id, overrideAccess: true })
      } catch (err) {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (err) {}
    }
  })

  it('calculates SHA-256 checksum and sets status upon file creation', async () => {
    const filename = `blueprint-${getSeq()}.dwg`
    const fileDoc = await createProductFileHelper(sellerA.id, filename, sellerA, false)

    expect(fileDoc.id).toBeDefined()
    expect(fileDoc.checksum).toBeDefined()
    expect(fileDoc.checksum?.length).toBe(64) // SHA-256 hex string length
    expect(fileDoc.status).toBe('READY')
    expect(fileDoc.virusScanStatus).toBe('clean')
    expect(fileDoc.fileFormat).toBe('.dwg')
  })

  it('strictly denies public guest from reading product_files (BR-06 invariant)', async () => {
    const fileDoc = await createProductFileHelper(sellerA.id, `private-file-${getSeq()}.rvt`)

    // 1. Query read denied
    await expect(
      payload.find({
        collection: 'product_files',
        where: {
          id: {
            equals: fileDoc.id,
          },
        },
        overrideAccess: false,
        user: null,
      }),
    ).rejects.toThrow()

    // 2. findByID denied
    await expect(
      payload.findByID({
        collection: 'product_files',
        id: fileDoc.id,
        overrideAccess: false,
        user: null,
      }),
    ).rejects.toThrow()
  })

  it('strictly denies regular buyer from reading product_files directly without entitlement token', async () => {
    const fileDoc = await createProductFileHelper(sellerA.id, `cad-details-${getSeq()}.dwg`)

    await expect(
      payload.find({
        collection: 'product_files',
        where: {
          id: {
            equals: fileDoc.id,
          },
        },
        overrideAccess: false,
        user: buyerUser,
      }),
    ).rejects.toThrow()

    await expect(
      payload.findByID({
        collection: 'product_files',
        id: fileDoc.id,
        overrideAccess: false,
        user: buyerUser,
      }),
    ).rejects.toThrow()
  })

  it('allows Seller A to read their own product files, but denies Seller B from reading Seller A files', async () => {
    const fileA = await createProductFileHelper(sellerA.id, `seller-a-vault-${getSeq()}.skp`, sellerA, false)

    // Seller A can read their own file
    const readBySellerA = await payload.findByID({
      collection: 'product_files',
      id: fileA.id,
      overrideAccess: false,
      user: sellerA,
    })
    expect(readBySellerA.id).toBe(fileA.id)

    // Seller B is denied
    await expect(
      payload.findByID({
        collection: 'product_files',
        id: fileA.id,
        overrideAccess: false,
        user: sellerB,
      }),
    ).rejects.toThrow()
  })

  it('allows Admin and Moderator to inspect product files for moderation audit', async () => {
    const fileDoc = await createProductFileHelper(sellerA.id, `audit-target-${getSeq()}.max`, sellerA, false)

    // Admin can read
    const readByAdmin = await payload.findByID({
      collection: 'product_files',
      id: fileDoc.id,
      overrideAccess: false,
      user: adminUser,
    })
    expect(readByAdmin.id).toBe(fileDoc.id)

    // Moderator can read
    const readByMod = await payload.findByID({
      collection: 'product_files',
      id: fileDoc.id,
      overrideAccess: false,
      user: moderatorUser,
    })
    expect(readByMod.id).toBe(fileDoc.id)
  })
})
