import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getOrCreateWallet } from '@/services/wallet'
import { WalletClient } from '@/components/wallet/WalletClient'
import { AccountDashboardLayout } from '@/components/AccountNav/AccountDashboardLayout'
import { RenderParams } from '@/components/RenderParams'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ví cá nhân & Nạp tiền | KienTaoHub',
  description: 'Quản lý số dư, nạp tiền qua SePay VietQR và tra cứu sổ cái tài chính cá nhân.',
}

export default async function WalletPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(
      `/login?warning=${encodeURIComponent('Vui lòng đăng nhập để xem thông tin ví cá nhân.')}`,
    )
  }

  // Get or initialize user's wallet
  const wallet = await getOrCreateWallet(payload, { userId: user.id })

  // Fetch recent ledger history (limit 50)
  const ledgerRes = await payload.find({
    collection: 'wallet_ledger',
    where: {
      user: {
        equals: user.id,
      },
    },
    sort: '-createdAt',
    limit: 50,
    overrideAccess: true,
  })

  const initialLedger = ledgerRes.docs.map((doc: any) => ({
    id: doc.id,
    type: doc.type,
    amount: Number(doc.amount),
    direction: doc.direction,
    referenceType: doc.referenceType,
    referenceId: doc.referenceId,
    balanceBefore: Number(doc.balanceBefore),
    balanceAfter: Number(doc.balanceAfter),
    description: doc.description,
    createdAt: doc.createdAt,
  }))

  return (
    <div className="min-h-screen py-6 sm:py-8 bg-[#f8fafc]">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
        <RenderParams className="mb-4" />
        <AccountDashboardLayout initialUser={user as any}>
          <div className="flex flex-col gap-6">
            {/* Top Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Link href="/" className="hover:text-slate-600 transition-colors">
                Trang chủ
              </Link>
              <span>&gt;</span>
              <Link href="/account" className="text-slate-600 font-medium hover:text-slate-900 transition-colors">
                Tài khoản
              </Link>
              <span>&gt;</span>
              <span className="text-slate-900 font-semibold">Ví kỹ thuật số</span>
            </div>

            <WalletClient
              initialWallet={{
                id: wallet.id,
                balance: Number(wallet.balance),
                pendingBalance: Number(wallet.pendingBalance),
                currency: wallet.currency,
                status: wallet.status,
              }}
              initialLedger={initialLedger}
            />
          </div>
        </AccountDashboardLayout>
      </div>
    </div>
  )
}
