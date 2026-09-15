import type { CollectionBeforeValidateHook } from 'payload'
import { ValidationError } from 'payload'

/**
 * Enforces BR-04: Sellers are strictly prohibited from purchasing their own products.
 *
 * Checks authoritative seller on the referenced product against the order buyer.
 * If buyer === seller, throws ValidationError to reject creation.
 */
export const validateAntiSelfPurchase: CollectionBeforeValidateHook = async ({
  data,
  req,
  operation,
}) => {
  if (operation !== 'create' || !data) return data

  const productId = typeof data.product === 'object' ? data.product?.id : data.product
  if (!productId) {
    return data
  }

  // 1. Fetch product to obtain authoritative seller ID
  const product = await req.payload.findByID({
    collection: 'products',
    id: productId,
    depth: 0,
    req,
  })

  if (!product) {
    throw new ValidationError({
      errors: [{ message: `Product ${productId} does not exist.`, path: 'product' }],
    })
  }

  const sellerId = typeof product.seller === 'object' ? product.seller?.id : product.seller
  if (!sellerId) {
    throw new ValidationError({
      errors: [{ message: `Product ${productId} has no assigned seller.`, path: 'seller' }],
    })
  }

  // Ensure data.seller matches the authoritative product seller
  data.seller = sellerId

  // 2. Resolve buyer ID from order or req.user
  let buyerId: string | number | undefined

  if (data.order) {
    if (typeof data.order === 'object' && (data.order as any).buyer) {
      const orderBuyer = (data.order as any).buyer
      buyerId = typeof orderBuyer === 'object' ? orderBuyer?.id : orderBuyer
    } else {
      const orderId = typeof data.order === 'object' ? data.order?.id : data.order
      if (orderId) {
        const order = await req.payload.findByID({
          collection: 'orders',
          id: orderId,
          depth: 0,
          req,
        })
        if (order) {
          buyerId = typeof order.buyer === 'object' ? order.buyer?.id : order.buyer
        }
      }
    }
  }

  if (!buyerId && req.user) {
    buyerId = req.user.id
  }

  // 3. Enforce BR-04
  if (buyerId && String(buyerId) === String(sellerId)) {
    throw new ValidationError({
      errors: [
        {
          message:
            'Anti-self-purchase invariant violated (BR-04): Sellers cannot purchase their own products.',
          path: 'product',
        },
      ],
    })
  }

  return data
}
