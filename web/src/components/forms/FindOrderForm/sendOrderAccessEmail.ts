'use server'

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { getServerSideURL } from '@/utilities/getURL'

type SendOrderAccessEmailArgs = {
  email: string
  orderID: string
}

type SendOrderAccessEmailResult = {
  success: boolean
  error?: string
}

export async function sendOrderAccessEmail({
  email,
  orderID,
}: SendOrderAccessEmailArgs): Promise<SendOrderAccessEmailResult> {
  const payload = await getPayload({ config: configPromise })

  try {
    const orderId = Number(orderID)
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return { success: true }
    }

    // This action is reachable from the public /find-order page, so it runs without a session and
    // both reads below need `overrideAccess`. `orders` in this schema has no `customerEmail` and no
    // `accessToken` column (src/collections/Orders/index.ts), so the previous query against
    // `customerEmail` was rejected by Payload ("path cannot be queried") and every submission took
    // the early `{success:true}` below without sending anything (inventory row B30). The requester is
    // instead tied to the order through its `buyer`: the account whose email was entered.
    const { docs: buyers } = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const buyer = buyers[0]

    if (!buyer) {
      return { success: true }
    }

    const { docs: orders } = await payload.find({
      collection: 'orders',
      where: {
        and: [{ id: { equals: orderId } }, { buyer: { equals: buyer.id } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const order = orders[0]

    if (!order) {
      return { success: true }
    }

    const serverURL = getServerSideURL()
    // `/orders/{id}` is the buyer's own order page: it renders for the session that owns the order and
    // redirects anyone else to /login, which is exactly the account this lookup just matched. The
    // template's `?email=&accessToken=` params are gone because neither field exists in this schema.
    const orderURL = `${serverURL}/orders/${order.id}`

    const emailBody = `
        <h1>View Your Order</h1>
        <p>Click the link below to view your order details:</p>
        <p><a href="${orderURL}">View Order #${order.id}</a></p>
        <p>Or copy and paste this URL into your browser:</p>
        <p>${orderURL}</p>
        <p>This link will give you access to view your order details.</p>
      `

    console.log('[sendOrderAccessEmail] Email body:', emailBody)

    await payload.sendEmail({
      to: email,
      subject: `Access your order #${order.id}`,
      html: emailBody,
    })

    return { success: true }
  } catch (err) {
    payload.logger.error({ msg: 'Failed to send order access email', err })
    return { success: true }
  }
}
