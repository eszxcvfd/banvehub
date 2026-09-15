import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getOrCreateWallet } from '@/services/wallet'
import { WalletClient } from '@/components/wallet/WalletClient'

export const metadata = {
  title: 'Ví cá nhân & Nạp tiền | KienTaoHub',
  description: 'Quản lý số dư, nạp tiền qua SePay VietQR và tra cứu sổ cái tài chính cá nhân.',
}

export default async function WalletPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(`/login?warning=${encodeURIComponent('Vui lòng đăng nhập để xem thông tin ví cá nhân.')}`)
  }

  // Get or initialize user's wallet
  const wallet = await getOrCreateWallet(payload, { userId: user.id })

  // Fetch recent ledger history
  const ledgerRes = await payload.find({
    collection: 'wallet_ledger',
    where: {
      user: {
        equals: user.id,
      },
    },
    sort: '-createdAt',
    limit: 20,
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
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Ví Kiến Tạo Hub</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Số dư dùng để mua tài nguyên CAD/BIM bản vẽ số tức thì, không cần nhập lại thẻ mỗi lần tải.
        </p>
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
  )
}
