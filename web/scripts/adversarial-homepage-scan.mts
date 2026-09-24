import 'dotenv/config'
import configPromise from '../src/payload.config'
import { getPayload } from 'payload'

async function scanHomepageForLeakedStrings() {
  console.log('=== SCANNING HOMEPAGE & DATABASE FOR LEAKED STRINGS ===')
  const payload = await getPayload({ config: configPromise })

  // 1. Check queries as executed in HomePage
  const cleanFilter = {
    _status: {
      equals: 'published',
    },
  }

  const heroProductsResult = await payload.find({
    collection: 'products',
    depth: 2,
    limit: 5,
    draft: false,
    overrideAccess: false,
    sort: '-createdAt',
    where: cleanFilter,
  })

  const bestSellersResult = await payload.find({
    collection: 'products',
    depth: 2,
    limit: 8,
    draft: false,
    overrideAccess: false,
    sort: '-price',
    where: cleanFilter,
  })

  const newArrivalsResult = await payload.find({
    collection: 'products',
    depth: 2,
    limit: 8,
    draft: false,
    overrideAccess: false,
    sort: '-createdAt',
    where: cleanFilter,
  })

  const allReturnedProducts = [
    ...(heroProductsResult.docs || []),
    ...(bestSellersResult.docs || []),
    ...(newArrivalsResult.docs || []),
  ]

  console.log(`Total homepage products retrieved from DB: ${allReturnedProducts.length}`)

  let leakFound = false
  const timestampRegex = /\b1789\d{9}\b/
  const lifecycleRegex = /lifecycle asset/i

  for (const product of allReturnedProducts) {
    const serialized = JSON.stringify(product)
    if (lifecycleRegex.test(serialized)) {
      console.error(`[LEAK DETECTED] Product ID ${product.id} contains "lifecycle asset": "${product.title}"`)
      leakFound = true
    }
    if (timestampRegex.test(serialized)) {
      console.error(`[LEAK DETECTED] Product ID ${product.id} contains epoch timestamp: "${product.title}"`)
      leakFound = true
    }
    if (product._status !== 'published') {
      console.error(`[LEAK DETECTED] Product ID ${product.id} is NOT published: status="${product._status}"`)
      leakFound = true
    }
  }

  if (!leakFound) {
    console.log('SUCCESS: Zero leaked Lifecycle Asset strings, zero timestamps, and zero draft products found in homepage queries.')
  } else {
    console.error('FAILURE: Leaked test data found in homepage queries!')
    process.exit(1)
  }

  process.exit(0)
}

scanHomepageForLeakedStrings().catch((err) => {
  console.error('Error running scan:', err)
  process.exit(1)
})
