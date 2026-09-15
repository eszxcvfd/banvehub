'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

export function RegisterForm() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!displayName.trim()) {
      setError('Vui lòng nhập tên thương hiệu / người bán.')
      return
    }

    if (!acceptedTerms) {
      setError('Bạn phải đồng ý với Điều khoản dành cho Người bán.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/seller/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim(),
          phone: phone.trim(),
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          accountHolderName: accountHolderName.trim().toUpperCase(),
          sellerTermsAccepted: acceptedTerms,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Đăng ký không thành công.')
      }

      router.push('/seller')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra, vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 rounded-md bg-destructive/15 text-destructive text-sm font-medium border border-destructive/20">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="displayName" className="font-semibold text-foreground">
          Tên thương hiệu / Người bán <span className="text-destructive">*</span>
        </Label>
        <Input
          id="displayName"
          placeholder="Ví dụ: KTS Hoàng Nam, BIM Studio Vietnam"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Tên này sẽ hiển thị công khai trên các bản vẽ và trang tác giả của bạn.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio" className="font-semibold text-foreground">
          Giới thiệu bản thân & Chuyên môn
        </Label>
        <Textarea
          id="bio"
          rows={3}
          placeholder="Chia sẻ kinh nghiệm thiết kế CAD/BIM, lĩnh vực sở trường (kiến trúc, kết cấu, MEP...)"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone" className="font-semibold text-foreground">
          Số điện thoại liên hệ
        </Label>
        <Input
          id="phone"
          type="tel"
          placeholder="0912 345 678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="border-t pt-6 space-y-4">
        <h3 className="text-base font-semibold text-foreground">
          Thông tin nhận doanh thu bán file (Rút tiền)
        </h3>
        <p className="text-xs text-muted-foreground">
          Thông tin tài khoản ngân hàng để KienTaoHub giải ngân doanh thu bán bản vẽ cho bạn.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bankName">Tên ngân hàng</Label>
            <Input
              id="bankName"
              placeholder="Vietcombank, MBBank, Techcombank..."
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountNumber">Số tài khoản</Label>
            <Input
              id="accountNumber"
              placeholder="1903..."
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="accountHolderName">Tên chủ tài khoản (Viết hoa không dấu)</Label>
          <Input
            id="accountHolderName"
            placeholder="NGUYEN VAN A"
            value={accountHolderName}
            onChange={(e) => setAccountHolderName(e.target.value.toUpperCase())}
          />
        </div>
      </div>

      <div className="border-t pt-6 space-y-4">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="terms"
            checked={acceptedTerms}
            onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
          />
          <Label htmlFor="terms" className="text-sm font-normal text-muted-foreground leading-snug cursor-pointer">
            Tôi đã đọc, hiểu rõ và đồng ý với{' '}
            <span className="font-medium text-primary underline">Điều khoản và Quy chế hoạt động dành cho Người bán</span>{' '}
            của KienTaoHub. Tôi cam kết chỉ đăng tải các bản vẽ, mô hình số mà tôi sở hữu hợp pháp hoặc có quyền phân phối.
          </Label>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full text-base py-6 font-semibold">
        {loading ? 'Đang xử lý đăng ký...' : 'Hoàn tất đăng ký & Bắt đầu bán file'}
      </Button>
    </form>
  )
}
