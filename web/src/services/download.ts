import type { Payload } from 'payload'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

export class UnauthorizedError extends Error {
  readonly statusCode = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class EntitlementRequiredError extends ForbiddenError {
  constructor(message = 'Active entitlement required to download this asset') {
    super(message)
    this.name = 'EntitlementRequiredError'
  }
}

export class TokenExpiredError extends Error {
  readonly statusCode = 401
  constructor(message = 'Download token has expired') {
    super(message)
    this.name = 'TokenExpiredError'
  }
}

export class InvalidTokenError extends Error {
  readonly statusCode = 400
  constructor(message = 'Invalid download token') {
    super(message)
    this.name = 'InvalidTokenError'
  }
}

export class FileNotFoundError extends Error {
  readonly statusCode = 404
  constructor(message = 'File not found on disk') {
    super(message)
    this.name = 'FileNotFoundError'
  }
}

function resolveProductFilePath(filename: string): string {
  const candidates = [
    path.resolve(process.cwd(), 'web/private/product_files', filename),
    path.resolve(process.cwd(), 'private/product_files', filename),
    path.resolve(__dirname, '../../private/product_files', filename),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

/**
 * Generate a short-lived, cryptographically signed download token (5-minute TTL)
 * for an authenticated user with an active entitlement.
 */
export async function createDownloadToken(
  payload: Payload,
  params: { userId: number; productId: number }
): Promise<DownloadTokenResult> {
  const { userId, productId } = params

  if (!userId || userId <= 0) {
    throw new UnauthorizedError('Authentication required to generate download token')
  }

  if (!productId || productId <= 0) {
    throw new InvalidTokenError('Product ID is required')
  }

  // Check for active entitlement
  const entitlements = await payload.find({
    collection: 'entitlements' as any,
    where: {
      and: [
        { user: { equals: userId } },
        { product: { equals: productId } },
        { status: { equals: 'active' } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })

  if (!entitlements.docs || entitlements.docs.length === 0) {
    // Check if user has revoked or expired entitlement
    const existingEnt = await payload.find({
      collection: 'entitlements' as any,
      where: {
        and: [
          { user: { equals: userId } },
          { product: { equals: productId } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })

    if (existingEnt.docs && existingEnt.docs.length > 0) {
      throw new ForbiddenError(`Entitlement is ${existingEnt.docs[0].status}`)
    }

    throw new EntitlementRequiredError('No active entitlement found for this product')
  }

  const entitlement = entitlements.docs[0]
  const secret = process.env.PAYLOAD_SECRET || 'secret'
  const ttlSeconds = 300 // 5 minutes
  const nowSeconds = Math.floor(Date.now() / 1000)
  const expSeconds = nowSeconds + ttlSeconds
  const jti = crypto.randomUUID()

  const token = jwt.sign(
    {
      userId,
      sub: userId,
      productId,
      entitlementId: entitlement.id,
      jti,
      exp: expSeconds,
    },
    secret
  )

  const expiresAt = new Date(expSeconds * 1000)
  const downloadUrl = `/api/v1/downloads/${token}`

  return {
    token,
    downloadUrl,
    expiresAt,
  }
}

/**
 * Validates a signed download token, enforces entitlement status, increments downloadCount,
 * records audit log in download_events, and returns a readable stream of the private file.
 */
export async function verifyAndStreamDownload(
  payload: Payload,
  token: string,
  clientMetadata: { ipAddress?: string; userAgent?: string } = {}
): Promise<StreamResult> {
  const secret = process.env.PAYLOAD_SECRET || 'secret'
  let decoded: any

  try {
    decoded = jwt.verify(token, secret)
  } catch (err: any) {
    const isExpired = err.name === 'TokenExpiredError'
    // Attempt best-effort decode to log event
    const partialDecode: any = jwt.decode(token)
    if (partialDecode && (partialDecode.userId || partialDecode.sub)) {
      try {
        await payload.create({
          collection: 'download_events' as any,
          data: {
            user: partialDecode.userId ?? partialDecode.sub,
            product: partialDecode.productId,
            entitlement: partialDecode.entitlementId,
            ipAddress: clientMetadata.ipAddress,
            userAgent: clientMetadata.userAgent,
            status: isExpired ? 'EXPIRED' : 'INVALID_TOKEN',
            downloadedAt: new Date().toISOString(),
          },
          overrideAccess: true,
        })
      } catch (_logErr) {
        // Logging error should not shadow verification error
      }
    }

    if (isExpired) {
      throw new TokenExpiredError('Download token has expired')
    }
    throw new InvalidTokenError('Invalid or tampered download token')
  }

  const userId = Number(decoded.userId ?? decoded.sub)
  const productId = Number(decoded.productId)
  const entitlementId = decoded.entitlementId

  // Verify entitlement is still active
  const entitlement = await payload.findByID({
    collection: 'entitlements' as any,
    id: entitlementId,
    overrideAccess: true,
  })

  if (!entitlement || entitlement.status !== 'active') {
    try {
      await payload.create({
        collection: 'download_events' as any,
        data: {
          user: userId,
          product: productId,
          entitlement: entitlementId,
          ipAddress: clientMetadata.ipAddress,
          userAgent: clientMetadata.userAgent,
          status: 'UNAUTHORIZED',
          downloadedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      })
    } catch (_logErr) {}
    throw new ForbiddenError('Entitlement is not active')
  }

  // Find product to locate original files
  const product: any = await payload.findByID({
    collection: 'products',
    id: productId,
    overrideAccess: true,
  })

  if (!product) {
    throw new FileNotFoundError('Product not found')
  }

  const rawFile = Array.isArray(product.originalFiles)
    ? product.originalFiles[0]
    : product.originalFiles

  if (!rawFile) {
    throw new FileNotFoundError('No files attached to this product')
  }

  let fileDoc: any = rawFile
  if (typeof rawFile === 'number' || typeof rawFile === 'string') {
    fileDoc = await payload.findByID({
      collection: 'product_files',
      id: rawFile,
      overrideAccess: true,
    })
  }

  if (!fileDoc || !fileDoc.filename) {
    throw new FileNotFoundError('Product file record not found')
  }

  const diskPath = resolveProductFilePath(fileDoc.filename)
  if (!fs.existsSync(diskPath)) {
    throw new FileNotFoundError(`File does not exist on disk: ${fileDoc.filename}`)
  }

  const stats = fs.statSync(diskPath)

  // Increment downloadCount on entitlement
  try {
    await payload.update({
      collection: 'entitlements' as any,
      id: entitlementId,
      data: {
        downloadCount: ((entitlement as any).downloadCount || 0) + 1,
      },
      overrideAccess: true,
    })
  } catch (_updateErr) {
    // Non-fatal if count fails to update
  }

  // Log successful download event
  try {
    await payload.create({
      collection: 'download_events' as any,
      data: {
        user: userId,
        product: productId,
        entitlement: entitlementId,
        ipAddress: clientMetadata.ipAddress,
        userAgent: clientMetadata.userAgent,
        status: 'SUCCESS',
        downloadedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
  } catch (_logErr) {}

  const stream = fs.createReadStream(diskPath)
  const filename = fileDoc.originalFilename || fileDoc.filename
  const mimeType = fileDoc.mimeType || 'application/octet-stream'
  const filesize = fileDoc.filesize || fileDoc.fileSize || stats.size

  return {
    stream,
    filename,
    mimeType,
    filesize,
  }
}
