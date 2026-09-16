import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { checkRole } from '@/access/utilities'
import { getSellerBalance } from '@/services/earnings'

async function getAuthContext(req: Request) {
  let headers: Headers
  try {
    headers = await getHeaders()
  } catch {
    headers = req.headers
  }
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })
  return { payload, user }
}

export async function GET(req: Request) {
  try {
    const { payload, user } = await getAuthContext(req)

    // Authenticate caller
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role authorization: verify checkRole(['seller', 'admin'], user)
    if (!checkRole(['seller', 'admin'], user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10) || 10))
    const status = url.searchParams.get('status')
    const sellerIdParam = url.searchParams.get('sellerId')

    // Seller ID: if checkRole(['admin'], user) and query param sellerId is passed, allow querying that seller; otherwise use user.id
    let sellerId = user.id
    if (checkRole(['admin'], user) && sellerIdParam) {
      const parsedSellerId = Number(sellerIdParam)
      if (!isNaN(parsedSellerId) && parsedSellerId > 0) {
        sellerId = parsedSellerId
      }
    }

    // Fetch balance summary using getSellerBalance(payload, sellerId) from @/services/earnings
    const balanceSummary = await getSellerBalance(payload, sellerId)

    // Query itemized earnings from seller_earnings collection
    const earningsResult = await payload.find({
      collection: 'seller_earnings',
      where: {
        seller: { equals: sellerId },
        ...(status ? { status: { equals: status } } : {}),
      },
      sort: '-createdAt',
      page,
      limit,
      overrideAccess: true,
      depth: 1,
    })

    // Return JSON
    return NextResponse.json({
      success: true,
      data: {
        summary: balanceSummary,
        earnings: earningsResult.docs,
        totalDocs: earningsResult.totalDocs,
        totalPages: earningsResult.totalPages,
        page: earningsResult.page,
        limit: earningsResult.limit,
      },
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
