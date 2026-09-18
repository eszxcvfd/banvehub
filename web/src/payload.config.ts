import { postgresAdapter } from '@payloadcms/db-postgres'

import {
  BoldFeature,
  EXPERIMENTAL_TableFeature,
  IndentFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  UnderlineFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Categories } from '@/collections/Categories'
import { Media } from '@/collections/Media'
import { Entitlements } from '@/collections/Entitlements'
import { DownloadEvents } from '@/collections/DownloadEvents'
import { Orders } from '@/collections/Orders'
import { OrderItems } from '@/collections/OrderItems'
import { SellerEarnings } from '@/collections/SellerEarnings'
import { Withdrawals } from '@/collections/Withdrawals'
import { WithdrawalEvents } from '@/collections/WithdrawalEvents'
import { Refunds } from '@/collections/Refunds'
import { Reviews } from '@/collections/Reviews'
import { Comments } from '@/collections/Comments'
import { Tickets } from '@/collections/Tickets'
import { ModerationCases } from '@/collections/ModerationCases'
import { Pages } from '@/collections/Pages'
import { PaymentIntents } from '@/collections/PaymentIntents'
import { PaymentTransactions } from '@/collections/PaymentTransactions'
import { PaymentWebhookEvents } from '@/collections/PaymentWebhookEvents'
import { ProductFiles } from '@/collections/ProductFiles'
import { ProductPreviews } from '@/collections/ProductPreviews'
import { Products } from '@/collections/Products'
import { SellerProfiles } from '@/collections/SellerProfiles'
import { SoftwareTypes } from '@/collections/SoftwareTypes'
import { Tags } from '@/collections/Tags'
import { Users } from '@/collections/Users'
import { WalletLedger } from '@/collections/WalletLedger'
import { Wallets } from '@/collections/Wallets'
import { Footer } from '@/globals/Footer'
import { Header } from '@/globals/Header'
import { CommissionSettings } from '@/globals/CommissionSettings'
import { plugins } from './plugins'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    components: {
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below and the import `BeforeLogin` statement on line 15.
      beforeLogin: ['@/components/BeforeLogin#BeforeLogin'],
      // The `BeforeDashboard` component renders the 'welcome' block that you see after logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below and the import `BeforeDashboard` statement on line 15.
      beforeDashboard: ['@/components/BeforeDashboard#BeforeDashboard'],
    },
    user: Users.slug,
  },
  collections: [
    Users,
    Pages,
    Categories,
    Media,
    SoftwareTypes,
    Tags,
    ProductPreviews,
    ProductFiles,
    Products,
    SellerProfiles,
    Wallets,
    WalletLedger,
    PaymentIntents,
    PaymentTransactions,
    PaymentWebhookEvents,
    Orders,
    OrderItems,
    Entitlements,
    DownloadEvents,
    SellerEarnings,
    Withdrawals,
    WithdrawalEvents,
    Refunds,
    Reviews,
    Comments,
    Tickets,
    ModerationCases,
  ],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    // Development uses migrations too, so the database never drifts ahead of a
    // committed migration (PLAN.md §37).
    push: false,
  }),
  editor: lexicalEditor({
    features: () => {
      return [
        UnderlineFeature(),
        BoldFeature(),
        ItalicFeature(),
        OrderedListFeature(),
        UnorderedListFeature(),
        LinkFeature({
          enabledCollections: ['pages'],
          fields: ({ defaultFields }) => {
            const defaultFieldsWithoutUrl = defaultFields.filter((field) => {
              if ('name' in field && field.name === 'url') return false
              return true
            })

            return [
              ...defaultFieldsWithoutUrl,
              {
                name: 'url',
                type: 'text',
                admin: {
                  condition: ({ linkType }) => linkType !== 'internal',
                },
                label: ({ t }) => t('fields:enterURL'),
                required: true,
              },
            ]
          },
        }),
        IndentFeature(),
        EXPERIMENTAL_TableFeature(),
      ]
    },
  }),
  //email: nodemailerAdapter(),
  endpoints: [],
  globals: [Header, Footer, CommissionSettings],
  plugins,
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // Sharp is now an optional dependency -
  // if you want to resize images, crop, set focal point, etc.
  // make sure to install it and pass it to the config.
  // sharp,
})
