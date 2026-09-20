import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { Plugin } from 'payload'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'

import { stripeAdapter } from '@payloadcms/plugin-ecommerce/payments/stripe'

import { Page, Product } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'
import { adminOrPublishedStatus } from '@/access/adminOrPublishedStatus'
import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'
import { buyerOnlyFieldAccess } from '@/access/buyerOnlyFieldAccess'
import { isAdmin } from '@/access/isAdmin'
import { isDocumentOwner } from '@/access/isDocumentOwner'

const generateTitle: GenerateTitle<Product | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | Payload Ecommerce Template` : 'Payload Ecommerce Template'
}

const generateURL: GenerateURL<Product | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formSubmissionOverrides: {
      labels: {
        singular: 'Form submission',
        plural: 'Form submissions',
      },
      access: {
        delete: isAdmin,
        read: isAdmin,
        update: isAdmin,
      },
      admin: {
        group: 'Content',
      },
    },
    formOverrides: {
      labels: {
        singular: 'Form',
        plural: 'Forms',
      },
      access: {
        delete: isAdmin,
        read: isAdmin,
        update: isAdmin,
        create: isAdmin,
      },
      admin: {
        group: 'Content',
      },
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })
      },
    },
  }),
  ecommercePlugin({
    access: {
      adminOnlyFieldAccess,
      adminOrPublishedStatus,
      customerOnlyFieldAccess: buyerOnlyFieldAccess,
      isAdmin,
      isDocumentOwner,
    },
    customers: {
      slug: 'users',
    },
    carts: false,
    products: false,
    orders: false,
    transactions: {
      transactionsCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        // Same display format as every other admin item, so the one plugin-provided collection
        // does not read differently from the rest (see the collections' `labels` blocks).
        labels: {
          singular: 'Transaction',
          plural: 'Transactions',
        },
        fields: defaultCollection.fields.filter(
          (field) => !('name' in field && field.name === 'cart'),
        ),
      }),
    },
    payments: {
      paymentMethods: [
        stripeAdapter({
          secretKey: process.env.STRIPE_SECRET_KEY!,
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
          webhookSecret: process.env.STRIPE_WEBHOOKS_SIGNING_SECRET!,
        }),
      ],
    },
  }),
  (incomingConfig) => {
    if (!incomingConfig.typescript) {
      incomingConfig.typescript = {}
    }
    if (!incomingConfig.typescript.schema) {
      incomingConfig.typescript.schema = []
    }
    incomingConfig.typescript.schema.push(({ jsonSchema }) => {
      const collections = (jsonSchema?.properties?.ecommerce as any)?.properties?.collections
      if (collections?.properties?.carts) {
        delete collections.properties.carts
      }
      if (Array.isArray(collections?.required)) {
        collections.required = collections.required.filter((s: string) => s !== 'carts')
      }
      if (collections?.properties?.orders) {
        delete collections.properties.orders
      }
      if (Array.isArray(collections?.required)) {
        collections.required = collections.required.filter((s: string) => s !== 'orders')
      }
      return jsonSchema
    })
    return incomingConfig
  },
]
