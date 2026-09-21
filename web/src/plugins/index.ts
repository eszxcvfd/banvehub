import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { Plugin } from 'payload'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'

import { Page, Product } from '@/payload-types'
import { SUPPORTED_COUNTRIES } from '@/constants/countries'
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
    // The address country list has one owner: `web/src/constants/countries.ts` (decision 0015). The
    // plugin replaces any `country` field config with a `select` over this list, so passing it here
    // is what makes the collection's validation, the admin select and the REST API accept `VN` —
    // and it is what the phase-14 migration's enum must stay equal to.
    addresses: {
      supportedCountries: SUPPORTED_COUNTRIES,
    },
    carts: false,
    products: false,
    orders: false,
    // The template's Stripe ledger. Decision 0004 replaced Stripe with SePay plus the wallet, so this
    // collection has had no writer since phase 4 while still claiming a sidebar group named
    // "Ecommerce" whose only page could never hold a row; phase 13 drops its two tables. `addresses`
    // and `customers` stay — the account area lists addresses through the plugin's `useAddresses`.
    transactions: false,
    // `payments` is omitted on purpose: the plugin sanitises a missing block into
    // `paymentMethods: []`, and the Stripe adapter was the only method, so no `/api/payments/*`
    // endpoint is registered at all. The client-side `EcommerceProvider` in `src/providers` stays
    // because the account area needs its `useAddresses`; the Stripe client it still mounts is
    // unused and is tracked separately from this schema change.
  }),
  (incomingConfig) => {
    if (!incomingConfig.typescript) {
      incomingConfig.typescript = {}
    }
    if (!incomingConfig.typescript.schema) {
      incomingConfig.typescript.schema = []
    }
    incomingConfig.typescript.schema.push(({ jsonSchema }) => {
      // The plugin's slug map lists every ecommerce collection unconditionally, so the generated
      // `ecommerce.collections` block keeps naming the ones this config disabled. `generate:types`
      // would then emit references to types it no longer defines (`transactions: Transaction` with
      // no `Transaction` interface anywhere), so every disabled slug leaves the block — from its
      // `properties` and from its `required` list.
      const collections = (jsonSchema?.properties?.ecommerce as any)?.properties?.collections
      for (const slug of ['carts', 'orders', 'transactions']) {
        if (collections?.properties?.[slug]) {
          delete collections.properties[slug]
        }
        if (Array.isArray(collections?.required)) {
          collections.required = collections.required.filter((s: string) => s !== slug)
        }
      }
      return jsonSchema
    })
    return incomingConfig
  },
]
