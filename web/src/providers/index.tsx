import { AuthProvider } from '@/providers/Auth'
import { CartProvider } from '@/providers/Cart'
import { EcommerceProvider } from '@payloadcms/plugin-ecommerce/client/react'
import { stripeAdapterClient } from '@payloadcms/plugin-ecommerce/payments/stripe'
import React from 'react'

import { HeaderThemeProvider } from './HeaderTheme'
import { ThemeProvider } from './Theme'
import { SonnerProvider } from '@/providers/Sonner'
import { AntdConfigProvider } from './Antd'

export const Providers: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  return (
    <ThemeProvider>
      <AntdConfigProvider>
        <AuthProvider>
          <HeaderThemeProvider>
            <SonnerProvider />
            <EcommerceProvider
              enableVariants={false}
              // Decision 0014: the plugin's own cart is backed by `/api/carts`, a route this config
              // does not register (`carts: false`, decision 0013). With `syncLocalStorage` left on,
              // the provider restores a cart id from localStorage and immediately fetches
              // `/api/carts/{id}`; off, the cart the storefront uses is the sessionStorage store in
              // `@/providers/Cart`, and the plugin stays mounted for `useAddresses`/`usePayments`.
              syncLocalStorage={false}
              currenciesConfig={{
                defaultCurrency: 'VND',
                supportedCurrencies: [
                  {
                    code: 'VND',
                    decimals: 0,
                    label: 'Việt Nam Đồng',
                    symbol: '₫',
                  },
                ],
              }}
              paymentMethods={[
                stripeAdapterClient({
                  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
                }),
              ]}
            >
              <CartProvider>{children}</CartProvider>
            </EcommerceProvider>
          </HeaderThemeProvider>
        </AuthProvider>
      </AntdConfigProvider>
    </ThemeProvider>
  )
}
