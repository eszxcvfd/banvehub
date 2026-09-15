import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { RegisterForm } from './RegisterForm'
import { checkRole } from '@/access/utilities'

export const metadata = {
  title: 'Đăng ký Người bán (Seller Onboarding) | KienTaoHub',
  description: 'Trở thành người bán bản vẽ và mô hình kiến trúc kỹ thuật số trên KienTaoHub.',
}

export default async function SellerRegisterPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(`/login?warning=${encodeURIComponent('Vui lòng đăng nhập trước khi đăng ký bán hàng.')}`)
  }

  // If already a seller with active profile, redirect to seller dashboard
  if (checkRole(['seller'], user)) {
    const existingProfile = await payload.find({
      collection: 'seller_profiles',
      where: {
        user: {
          equals: user.id,
        },
      },
      overrideAccess: true,
      limit: 1,
    })

    if (existingProfile.totalDocs > 0) {
      redirect('/seller')
    }
  }

  return (
    <div className="container max-w-2xl py-12 px-4 mx-auto">
      <div className="border rounded-xl p-8 bg-card shadow-sm space-y-6">
        <div className="space-y-2 border-b pb-6">
          <span className="text-xs uppercase font-bold tracking-wider text-primary px-2.5 py-1 rounded bg-primary/10 inline-block">
            Seller Onboarding
          </span>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Đăng ký trở thành Người bán trên KienTaoHub
          </h1>
          <p className="text-sm text-muted-foreground">
            Tiếp cận hàng nghìn kỹ sư, kiến trúc sư và sinh viên xây dựng trên toàn quốc. Đăng tải bản vẽ AutoCAD, Revit, SketchUp và kiếm doanh thu tự động 24/7.
          </p>
        </div>

        <RegisterForm />
      </div>
    </div>
  )
}
