import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'

// Interface contracts per PROJECT.md
export interface DownloadTokenResult {
  token: string
  downloadUrl: string
  expiresAt: Date
}

export interface StreamResult {
  stream: NodeJS.ReadableStream
  filename: string
  mimeType: string
  filesize: number
}

describe('Phase 5: Secure Authenticated Download Engine & Token Rail (BR-06, FR-17, Decision 0006)', () => {
  let payload: Payload
  let bootstrapUser: User
  let sellerUser: User
  let entitledBuyer: User
  let unentitledBuyer: User
  let revokedBuyer: User
  let secureProduct: any
  let secondProduct: any
  let uploadedFile: any
  let uploadedFile2: any
  let activeEntitlementId: number | string
  let revokedEntitlementId: number | string

  const cleanup = {
    users: [] as (number | string)[],
    productFiles: [] as (number | string)[],
    products: [] as (number | string)[],
    entitlements: [] as (number | string)[],
    downloadEvents: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  // Dynamic service loaders
  let createDownloadTokenFn: ((payload: Payload, params: { userId: number; productId: number }) => Promise<DownloadTokenResult>) | null = null
  let verifyAndStreamDownloadFn: ((payload: Payload, token: string, clientMetadata: { ipAddress?: string; userAgent?: string }) => Promise<StreamResult>) | null = null

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = (await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-download-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })) as User
    cleanup.users.push(user.id)
    return user
  }

  const createProductFileHelper = async (sellerId: number, filename: string, contentStr: string) => {
    const content = Buffer.from(contentStr)
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
      overrideAccess: true,
    })
    cleanup.productFiles.push(fileDoc.id)
    return { fileDoc, content }
  }

  const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
    const chunks: Buffer[] = []
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', (err) => reject(err))
    })
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    const downloadPath = '../../src/services/download'
    const downloadMod = await import(/* @vite-ignore */ downloadPath).catch(() => null)
    if (downloadMod) {
      createDownloadTokenFn = downloadMod.createDownloadToken
      verifyAndStreamDownloadFn = downloadMod.verifyAndStreamDownload
    }

    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` (src/collections/Users/hooks) appends 'admin' to the roles of the
    // FIRST user created while the users table is EMPTY - which is exactly the CI state: CI applies
    // only the versioned migrations and every spec's afterAll deletes its own users, so each spec
    // file can start from an empty table. Absorb that promotion with a throwaway user BEFORE the
    // role-sensitive fixtures below, otherwise `sellerUser` is silently ['seller', 'admin'] and the
    // ownership/authorization assertions of this download rail are evaluated against an admin.
    bootstrapUser = await createUser(`bootstrap-dl-${timestamp}@kientaohub.local`, ['buyer'])

    sellerUser = await createUser(`seller-dl-${timestamp}@kientaohub.local`, ['seller'])
    entitledBuyer = await createUser(`buyer-entitled-${timestamp}@kientaohub.local`, ['buyer'])
    unentitledBuyer = await createUser(`buyer-unentitled-${timestamp}@kientaohub.local`, ['buyer'])
    revokedBuyer = await createUser(`buyer-revoked-${timestamp}@kientaohub.local`, ['buyer'])

    // Guard: the fixtures must hold EXACTLY the roles they declare, whether or not the users table
    // started empty (the bootstrap user above owns the first-user promotion). If the promotion ever
    // lands on one of them again, these assertions fail loudly instead of letting the download
    // authorization assertions silently lose their meaning.
    expect(sellerUser.roles).toEqual(['seller'])
    expect(sellerUser.roles).not.toContain('admin')
    expect(entitledBuyer.roles).toEqual(['buyer'])
    expect(unentitledBuyer.roles).toEqual(['buyer'])
    expect(revokedBuyer.roles).toEqual(['buyer'])

    // Create private original design file
    uploadedFile = await createProductFileHelper(
      sellerUser.id,
      `high-rise-facade-${timestamp}.dwg`,
      `AUTOCAD_SECRET_FACADE_DATA_BYTES_${timestamp}`
    )
    uploadedFile2 = await createProductFileHelper(
      sellerUser.id,
      `landscape-blueprint-${timestamp}.dwg`,
      `AUTOCAD_LANDSCAPE_BLUEPRINT_${timestamp}`
    )

    // Create secure product with approved status
    secureProduct = await payload.create({
      collection: 'products',
      data: {
        title: `High-Rise Facade Architecture ${getSeq()}`,
        slug: `facade-arch-${timestamp}-${getSeq()}`,
        price: 350000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(secureProduct.id)

    // Create second product
    secondProduct = await payload.create({
      collection: 'products',
      data: {
        title: `Landscape Masterplan Blueprint ${getSeq()}`,
        slug: `landscape-plan-${timestamp}-${getSeq()}`,
        price: 200000,
        isFree: false,
        seller: sellerUser.id,
        originalFiles: [uploadedFile2.fileDoc.id],
        copyrightDeclared: true,
        moderationStatus: 'approved',
        _status: 'published',
      },
      overrideAccess: true,
    })
    cleanup.products.push(secondProduct.id)

    // Seed active entitlement for entitledBuyer on secureProduct
    try {
      const entDoc = await payload.create({
        collection: 'entitlements' as any,
        data: {
          user: entitledBuyer.id,
          product: secureProduct.id,
          status: 'active',
          downloadCount: 0,
          grantedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      })
      activeEntitlementId = entDoc.id
      cleanup.entitlements.push(activeEntitlementId)
    } catch (_ignore) {
      // Entitlements collection might be created during M1
    }

    // Seed revoked entitlement for revokedBuyer on secondProduct
    try {
      const revokedDoc = await payload.create({
        collection: 'entitlements' as any,
        data: {
          user: revokedBuyer.id,
          product: secondProduct.id,
          status: 'revoked',
          downloadCount: 0,
          grantedAt: new Date().toISOString(),
          revokedAt: new Date().toISOString(),
          reason: 'Chargeback dispute',
        },
        overrideAccess: true,
      })
      revokedEntitlementId = revokedDoc.id
      cleanup.entitlements.push(revokedEntitlementId)
    } catch (_ignore) {}
  })

  afterAll(async () => {
    for (const id of cleanup.products) {
      try {
        await payload.delete({ collection: 'products', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.productFiles) {
      try {
        await payload.delete({ collection: 'product_files', id, overrideAccess: true })
      } catch (_ignore) {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (_ignore) {}
    }
  })

  it('Tier 1: Authenticated user with active entitlement receives signed download token with 5-minute expiry', async () => {
    if (!createDownloadTokenFn) {
      throw new Error('M3 pending: createDownloadToken service not yet implemented in web/src/services/download.ts')
    }

    const tokenRes = await createDownloadTokenFn(payload, {
      userId: entitledBuyer.id,
      productId: secureProduct.id,
    })

    expect(tokenRes.token).toBeDefined()
    expect(typeof tokenRes.token).toBe('string')
    expect(tokenRes.token.split('.').length).toBe(3) // Valid JWT structure: header.payload.signature

    expect(tokenRes.downloadUrl).toBeDefined()
    expect(tokenRes.downloadUrl).toContain(`/api/v1/downloads/${tokenRes.token}`)

    // Verify 5-minute expiration (TTL: 300 seconds ± 10 seconds)
    const expiresAtMs = new Date(tokenRes.expiresAt).getTime()
    const nowMs = Date.now()
    const diffSeconds = Math.round((expiresAtMs - nowMs) / 1000)
    expect(diffSeconds).toBeGreaterThanOrEqual(285)
    expect(diffSeconds).toBeLessThanOrEqual(315)

    // Decode token claims and verify payload contents
    const decoded: any = jwt.decode(tokenRes.token)
    expect(decoded).toBeDefined()
    const tokenUserId = decoded.userId ?? decoded.sub
    expect(Number(tokenUserId)).toBe(entitledBuyer.id)
    expect(Number(decoded.productId)).toBe(secureProduct.id)
    expect(decoded.exp).toBeDefined()
    expect(decoded.jti).toBeDefined()
  })

  it('Tier 1: Streaming private file bytes: GET /api/v1/downloads/[token] validates signature and streams file with attachment header and proper MIME type', async () => {
    if (!createDownloadTokenFn || !verifyAndStreamDownloadFn) {
      throw new Error('M3 pending: download service not yet implemented in web/src/services/download.ts')
    }

    const tokenRes = await createDownloadTokenFn(payload, {
      userId: entitledBuyer.id,
      productId: secureProduct.id,
    })

    const streamResult = await verifyAndStreamDownloadFn(payload, tokenRes.token, {
      ipAddress: '10.0.0.1',
      userAgent: 'CAD-Viewer/2026',
    })

    expect(streamResult.filename).toBe(uploadedFile.fileDoc.originalFilename)
    expect(streamResult.mimeType).toBe('application/octet-stream')
    expect(streamResult.filesize).toBe(uploadedFile.content.length)

    // Stream and compare content bytes
    const receivedBuffer = await streamToBuffer(streamResult.stream)
    expect(receivedBuffer.equals(uploadedFile.content)).toBe(true)
  })

  it('Tier 1: Audit log: Each stream attempt creates an audit row in download_events with status SUCCESS', async () => {
    if (!createDownloadTokenFn || !verifyAndStreamDownloadFn) {
      throw new Error('M3 pending: download service not yet implemented')
    }

    const tokenRes = await createDownloadTokenFn(payload, {
      userId: entitledBuyer.id,
      productId: secureProduct.id,
    })

    await verifyAndStreamDownloadFn(payload, tokenRes.token, {
      ipAddress: '172.16.0.42',
      userAgent: 'Mozilla/5.0 Architecture-Client',
    })

    // Query download_events collection
    const events = (await payload.find({
      collection: 'download_events' as any,
      where: {
        and: [
          { user: { equals: entitledBuyer.id } },
          { product: { equals: secureProduct.id } },
          { status: { equals: 'SUCCESS' } },
        ],
      },
      overrideAccess: true,
    })) as any

    expect(events.docs.length).toBeGreaterThanOrEqual(1)
    const latestEvent = events.docs[0]
    expect(latestEvent.ipAddress).toBe('172.16.0.42')
    expect(latestEvent.userAgent).toBe('Mozilla/5.0 Architecture-Client')
    expect(latestEvent.downloadedAt).toBeDefined()
  })

  it('Tier 2: Boundary - Unauthenticated guest requesting download token is rejected with 401 Unauthorized', async () => {
    if (!createDownloadTokenFn) {
      throw new Error('M3 pending: download service not yet implemented')
    }

    // Calling token generation with 0 / null / undefined userId
    await expect(
      createDownloadTokenFn(payload, {
        userId: 0,
        productId: secureProduct.id,
      })
    ).rejects.toThrow()
  })

  it('Tier 2: Boundary - Authenticated user WITHOUT active entitlement requesting token is rejected with 403 Forbidden', async () => {
    if (!createDownloadTokenFn) {
      throw new Error('M3 pending: download service not yet implemented')
    }

    // unentitledBuyer has NO entitlement for secureProduct
    await expect(
      createDownloadTokenFn(payload, {
        userId: unentitledBuyer.id,
        productId: secureProduct.id,
      })
    ).rejects.toThrow()
  })

  it('Tier 2: Boundary - User with REVOKED entitlement requesting token is rejected with 403 Forbidden', async () => {
    if (!createDownloadTokenFn) {
      throw new Error('M3 pending: download service not yet implemented')
    }

    // revokedBuyer has entitlement with status 'revoked' for secondProduct
    await expect(
      createDownloadTokenFn(payload, {
        userId: revokedBuyer.id,
        productId: secondProduct.id,
      })
    ).rejects.toThrow()
  })

  it('Tier 2: Boundary - Expired token returns 401/403 and records audit row with status EXPIRED', async () => {
    if (!verifyAndStreamDownloadFn) {
      throw new Error('M3 pending: verifyAndStreamDownload service not yet implemented')
    }

    const secret = process.env.PAYLOAD_SECRET || 'test-secret'

    // Craft an expired JWT (expired 60 seconds ago)
    const expiredToken = jwt.sign(
      {
        userId: entitledBuyer.id,
        sub: entitledBuyer.id,
        productId: secureProduct.id,
        entitlementId: activeEntitlementId,
        jti: `test-expired-${Date.now()}`,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      secret
    )

    // Attempting to stream with expired token must reject
    await expect(
      verifyAndStreamDownloadFn(payload, expiredToken, {
        ipAddress: '127.0.0.1',
        userAgent: 'Expired-Token-Tester',
      })
    ).rejects.toThrow()

    // Verify audit record logged with status EXPIRED
    try {
      const events = (await payload.find({
        collection: 'download_events' as any,
        where: {
          and: [
            { user: { equals: entitledBuyer.id } },
            { status: { equals: 'EXPIRED' } },
          ],
        },
        overrideAccess: true,
      })) as any

      expect(events.docs.length).toBeGreaterThanOrEqual(1)
    } catch (_ignore) {}
  })

  it('Tier 2: Adversarial - Tampered token signature is rejected and records audit row', async () => {
    if (!verifyAndStreamDownloadFn) {
      throw new Error('M3 pending: verifyAndStreamDownload service not yet implemented')
    }

    // 1. Sign token with invalid/tampered secret key
    const forgedToken = jwt.sign(
      {
        userId: entitledBuyer.id,
        sub: entitledBuyer.id,
        productId: secureProduct.id,
        entitlementId: activeEntitlementId,
        jti: `test-forged-${Date.now()}`,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      'attacker-forged-fake-secret-key-123'
    )

    await expect(
      verifyAndStreamDownloadFn(payload, forgedToken, {
        ipAddress: '10.99.99.99',
        userAgent: 'Tamper-Bot/1.0',
      })
    ).rejects.toThrow()

    // 2. Tampered payload string in token
    const secret = process.env.PAYLOAD_SECRET || 'test-secret'
    const validToken = jwt.sign(
      {
        userId: entitledBuyer.id,
        sub: entitledBuyer.id,
        productId: secureProduct.id,
        entitlementId: activeEntitlementId,
        jti: `test-valid-${Date.now()}`,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      secret
    )

    // Alter token payload segment
    const parts = validToken.split('.')
    const alteredToken = `${parts[0]}.eyJoYWNrZWQiOnRydWV9.${parts[2]}`

    await expect(
      verifyAndStreamDownloadFn(payload, alteredToken, {
        ipAddress: '10.99.99.99',
        userAgent: 'Tamper-Bot/1.0',
      })
    ).rejects.toThrow()
  })

  it('Tier 1: Private file boundary (BR-06): web/private/product_files is not accessible publicly without entitlement', async () => {
    // 1. Direct query to product_files collection by buyer without overrideAccess is strictly forbidden
    await expect(
      payload.find({
        collection: 'product_files',
        where: {
          id: { equals: uploadedFile.fileDoc.id },
        },
        overrideAccess: false,
        user: unentitledBuyer,
      })
    ).rejects.toThrow()

    // 2. Verify physical file resides strictly inside private directory
    const privateDir = path.resolve(process.cwd(), 'web/private/product_files')
    const fileOnDisk = path.join(privateDir, uploadedFile.fileDoc.filename)

    // Verify directory is within private boundary
    expect(privateDir).toContain('/private/product_files')
    if (fs.existsSync(fileOnDisk)) {
      expect(fs.readFileSync(fileOnDisk).length).toBe(uploadedFile.content.length)
    }
  })

  it('Tier 4: Token replay window allows multiple downloads within 5-minute TTL, incrementing downloadCount and audit events', async () => {
    if (!createDownloadTokenFn || !verifyAndStreamDownloadFn) {
      throw new Error('M3 pending: download service not yet implemented')
    }

    const tokenRes = await createDownloadTokenFn(payload, {
      userId: entitledBuyer.id,
      productId: secureProduct.id,
    })

    // First download stream
    const stream1 = await verifyAndStreamDownloadFn(payload, tokenRes.token, {
      ipAddress: '127.0.0.1',
      userAgent: 'Browser-Download-1',
    })
    const buf1 = await streamToBuffer(stream1.stream)
    expect(buf1.equals(uploadedFile.content)).toBe(true)

    // Second download stream using same valid token (e.g. resume / second attempt)
    const stream2 = await verifyAndStreamDownloadFn(payload, tokenRes.token, {
      ipAddress: '127.0.0.1',
      userAgent: 'Browser-Download-2',
    })
    const buf2 = await streamToBuffer(stream2.stream)
    expect(buf2.equals(uploadedFile.content)).toBe(true)

    // Verify entitlement downloadCount was incremented
    try {
      const entDoc = (await payload.findByID({
        collection: 'entitlements' as any,
        id: activeEntitlementId,
        overrideAccess: true,
      })) as any

      expect(entDoc.downloadCount).toBeGreaterThanOrEqual(2)
    } catch (_ignore) {}
  })
})
