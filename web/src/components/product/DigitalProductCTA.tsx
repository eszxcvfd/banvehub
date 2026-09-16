'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertCircle,
  CheckCircle2,
  DownloadCloud,
  FileCheck,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  UserCheck,
  Wallet,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/providers/Auth'
import { toast } from 'sonner'

export type DigitalProductCTAProps = {
  productId?: number
  sellerId?: number | string | null
  isFree?: boolean | null
  price?: number
  fileFormat?: string | null
  fileSize?: string | null
  productTitle?: string
  className?: string
}

export function DigitalProductCTA({
  productId,
  sellerId,
  isFree,
  price = 0,
  fileFormat,
  fileSize,
  productTitle,
  className = '',
}: DigitalProductCTAProps) {
  const { user } = useAuth()
  const pathname = usePathname()
  const returnUrl = pathname || '/shop'

  const numericPrice =
    typeof price === 'number' && !isNaN(price) && price > 0 ? price : 0
  const free = Boolean(isFree) || numericPrice === 0
  const isSeller = Boolean(
    user &&
      sellerId !== null &&
      sellerId !== undefined &&
      String(user.id) === String(sellerId),
  )

  const currentUserId = user?.id

  const [serverEntitled, setServerEntitled] = useState<{
    userId: string | number
    productId: number
  } | null>(null)
  const [purchased, setPurchased] = useState<{
    userId: string | number
    productId: number
  } | null>(null)
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false)
  const [isDownloading, setIsDownloading] = useState<boolean>(false)
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false)
  const [insufficientFunds, setInsufficientFunds] = useState<{
    userId: string | number
    productId: number
    required: number
    balance: number
    shortfall: number
  } | null>(null)

  const hasServerEntitlement = Boolean(
    currentUserId &&
      productId &&
      serverEntitled?.userId === currentUserId &&
      serverEntitled?.productId === productId,
  )
  const hasLocalPurchase = Boolean(
    currentUserId &&
      productId &&
      purchased?.userId === currentUserId &&
      purchased?.productId === productId,
  )
  const isOwned = Boolean(user) && !isSeller && (hasLocalPurchase || hasServerEntitlement)
  const activeInsufficientFunds =
    insufficientFunds &&
    currentUserId &&
    insufficientFunds.userId === currentUserId &&
    insufficientFunds.productId === productId
      ? insufficientFunds
      : null

  // Query entitlement state on mount or user/productId change
  useEffect(() => {
    if (!user || !productId || isSeller) {
      return
    }

    let mounted = true
    const activeUserId = user.id
    const controller = new AbortController()

    fetch(`/api/v1/me/entitlements?productId=${productId}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted) return
        if (data?.hasEntitlement) {
          setServerEntitled({ userId: activeUserId, productId })
        } else {
          setServerEntitled((prev) =>
            prev?.productId === productId && prev?.userId === activeUserId ? null : prev,
          )
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        if (mounted) {
          setServerEntitled((prev) =>
            prev?.productId === productId && prev?.userId === activeUserId ? null : prev,
          )
        }
      })

    return () => {
      mounted = false
      controller.abort()
    }
  }, [user, productId, isSeller])

  // Cross-tab synchronization: listen for purchases made in other tabs
  useEffect(() => {
    if (typeof window === 'undefined' || !user || !productId) {
      return
    }

    const activeUserId = user.id

    // 1. BroadcastChannel for instant cross-tab sync
    let channel: BroadcastChannel | null = null
    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel('kientaohub_purchases')
        channel.onmessage = (event) => {
          if (
            event.data?.type === 'PURCHASE_COMPLETED' &&
            event.data?.productId === productId &&
            String(event.data?.userId) === String(activeUserId)
          ) {
            setPurchased({ userId: activeUserId, productId })
            setServerEntitled({ userId: activeUserId, productId })
            setInsufficientFunds(null)
          }
        }
      } catch {}
    }

    // 2. Storage event fallback
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'kt_last_purchase' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue)
          if (data?.productId === productId && String(data?.userId) === String(activeUserId)) {
            setPurchased({ userId: activeUserId, productId })
            setServerEntitled({ userId: activeUserId, productId })
            setInsufficientFunds(null)
          }
        } catch {}
      }
    }

    // 3. Focus / visibilitychange revalidation
    const handleRevalidate = () => {
      if (document.visibilityState === 'visible') {
        fetch(`/api/v1/me/entitlements?productId=${productId}`, {
          credentials: 'include',
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.hasEntitlement) {
              setServerEntitled({ userId: activeUserId, productId })
              setInsufficientFunds(null)
            }
          })
          .catch(() => {})
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', handleRevalidate)
    document.addEventListener('visibilitychange', handleRevalidate)

    return () => {
      if (channel) {
        channel.close()
      }
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', handleRevalidate)
      document.removeEventListener('visibilitychange', handleRevalidate)
    }
  }, [user, productId])

  const broadcastPurchase = (userId: string | number, pId: number) => {
    if (typeof window === 'undefined') return
    try {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('kientaohub_purchases')
        channel.postMessage({
          type: 'PURCHASE_COMPLETED',
          userId,
          productId: pId,
        })
        channel.close()
      }
      localStorage.setItem(
        'kt_last_purchase',
        JSON.stringify({ userId, productId: pId, timestamp: Date.now() }),
      )
    } catch {}
  }

  // Trigger file download via download token
  const triggerDownload = async (targetProductId?: number) => {
    const pId = targetProductId || productId
    if (!pId) return

    if (!user) {
      setShowLoginModal(true)
      return
    }

    setIsDownloading(true)
    try {
      const res = await fetch('/api/v1/downloads/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId: pId }),
      })

      const data = await res.json()

      if (!res.ok || !data?.data?.downloadUrl) {
        if (res.status === 401) {
          setShowLoginModal(true)
          return
        }
        throw new Error(data?.message || 'Không thể tạo liên kết tải xuống.')
      }

      // Initiate file download via invisible link
      const link = document.createElement('a')
      link.href = data.data.downloadUrl
      link.setAttribute('download', '')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      if (pId && user?.id) {
        setPurchased({ userId: user.id, productId: pId })
        broadcastPurchase(user.id, pId)
      }
      toast.success(
        `Bắt đầu tải xuống tệp${productTitle ? `: ${productTitle}` : ''}!`,
        {
          description: 'Nếu tệp không tự động tải, hãy kiểm tra quyền tải xuống trình duyệt.',
        }
      )
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Có lỗi xảy ra khi tải tệp. Vui lòng thử lại.'
      toast.error(message)
    } finally {
      setIsDownloading(false)
    }
  }

  // Handle commercial purchase flow
  const handlePurchase = async () => {
    if (!productId) return

    if (!user) {
      setShowLoginModal(true)
      return
    }

    if (isSeller) {
      toast.error('Người bán không thể tự mua sản phẩm của chính mình (BR-04).')
      return
    }

    setIsPurchasing(true)
    try {
      const res = await fetch('/api/v1/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId }),
      })

      const data = await res.json()

      if (res.ok && data?.success) {
        setPurchased({ userId: user.id, productId })
        broadcastPurchase(user.id, productId)
        setInsufficientFunds(null)
        setIsPurchasing(false)
        toast.success('Thanh toán thành công! Đang chuẩn bị tệp tải xuống...')
        await triggerDownload(productId)
        return
      }

      if (res.status === 409 || data?.error === 'ALREADY_OWNED') {
        setPurchased({ userId: user.id, productId })
        broadcastPurchase(user.id, productId)
        setInsufficientFunds(null)
        setIsPurchasing(false)
        toast.info('Bạn đã sở hữu sản phẩm này. Bắt đầu tải tệp...')
        await triggerDownload(productId)
        return
      }

      if (data?.error === 'INSUFFICIENT_FUNDS') {
        const required = data.required ?? price
        const balance = data.balance ?? 0
        const shortfall = Math.max(0, required - balance)
        setInsufficientFunds({ userId: user.id, productId, required, balance, shortfall })
        return
      }

      if (res.status === 401 || data?.error === 'UNAUTHORIZED') {
        setShowLoginModal(true)
        return
      }

      if (data?.error === 'SELF_PURCHASE_FORBIDDEN') {
        toast.error(data.message || 'Người bán không thể mua sản phẩm của chính mình.')
        return
      }

      throw new Error(data?.message || 'Giao dịch không thành công.')
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Có lỗi xảy ra trong quá trình thanh toán.'
      toast.error(message)
    } finally {
      setIsPurchasing(false)
    }
  }

  const handleAction = () => {
    if (isSeller || isPurchasing || isDownloading) {
      return
    }

    // Fallback for standalone/mock renders where productId is not wired
    if (!productId) {
      if (free) {
        alert(`Đang chuẩn bị tệp tải xuống: ${productTitle || 'Tài nguyên số'}`)
      } else {
        alert(
          `Khởi tạo thanh toán số cho: ${productTitle || 'Tài nguyên số'} (${numericPrice.toLocaleString('vi-VN')} ₫)`,
        )
      }
      return
    }

    if (free || isOwned) {
      void triggerDownload()
    } else {
      void handlePurchase()
    }
  }

  return (
    <div className={`rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-5 ${className}`}>
      {/* Price Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Đơn giá giấy phép số
        </span>
        {free ? (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            Miễn phí
          </span>
        ) : isOwned ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Đã sở hữu
          </span>
        ) : isSeller ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <UserCheck className="w-3.5 h-3.5" />
            Sản phẩm của bạn
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Bản quyền thương mại
          </span>
        )}
      </div>

      {/* Price Display */}
      <div className="flex items-baseline gap-2">
        {free ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight font-mono">
              Miễn phí
            </span>
            <span className="text-sm text-muted-foreground line-through">
              0 ₫
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              {numericPrice.toLocaleString('vi-VN')}
            </span>
            <span className="text-xl font-bold text-muted-foreground">₫</span>
          </div>
        )}
      </div>

      {/* Seller or Ownership Notice Banner */}
      {isSeller ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs">
          <UserCheck className="w-4 h-4 shrink-0" />
          <span>Bạn là tác giả của sản phẩm này. Bạn không thể tự mua sản phẩm của chính mình.</span>
        </div>
      ) : isOwned && !free ? (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Bạn đã sở hữu giấy phép sử dụng hợp lệ cho tài nguyên này.</span>
        </div>
      ) : null}

      {/* Main Call To Action Button */}
      {isPurchasing || isDownloading ? (
        <Button
          disabled
          className="w-full bg-primary/80 text-primary-foreground font-semibold py-6 text-base shadow-sm flex items-center justify-center gap-2 cursor-wait"
          size="lg"
        >
          <Loader2 className="w-5 h-5 animate-spin" />
          {isDownloading ? 'Đang tạo liên kết tải...' : 'Đang xử lý thanh toán...'}
        </Button>
      ) : isSeller ? (
        <Button
          disabled
          className="w-full bg-muted text-muted-foreground font-semibold py-6 text-base shadow-none flex items-center justify-center gap-2 cursor-not-allowed border"
          size="lg"
        >
          <ShieldCheck className="w-5 h-5 text-amber-500" />
          Sản phẩm của bạn
        </Button>
      ) : free || isOwned ? (
        <Button
          onClick={handleAction}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-6 text-base shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          size="lg"
        >
          <DownloadCloud className="w-5 h-5" />
          {free ? 'Tải xuống ngay (Miễn phí)' : 'Tải xuống ngay'}
        </Button>
      ) : (
        <Button
          onClick={handleAction}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          size="lg"
        >
          <ShoppingBag className="w-5 h-5" />
          Mua ngay — {numericPrice.toLocaleString('vi-VN')} ₫
        </Button>
      )}

      {/* Engineering Trust Indicators */}
      <div className="flex flex-col gap-2.5 pt-4 border-t text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500 shrink-0" />
          <span>Tải xuống tức thì — Truy cập không giới hạn thời gian</span>
        </div>
        <div className="flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-blue-500 shrink-0" />
          <span>
            Bao gồm file gốc {fileFormat ? `(${fileFormat})` : ''} {fileSize ? `• ${fileSize}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>Bảo mật tuyệt đối, hoàn tiền 100% nếu file lỗi kỹ thuật</span>
        </div>
      </div>

      {/* Guest Login Required Modal (R4) */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <LogIn className="w-5 h-5 text-primary" />
              Yêu cầu đăng nhập
            </DialogTitle>
            <DialogDescription>
              Vui lòng đăng nhập hoặc đăng ký tài khoản KienTaoHub để{' '}
              {free
                ? 'tải xuống tài nguyên miễn phí'
                : `mua và tải xuống ${productTitle ? `"${productTitle}"` : 'tài nguyên này'}`}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-xs text-muted-foreground leading-relaxed">
            Tài khoản giúp bạn lưu trữ quyền tải và truy cập lại tệp bất cứ lúc nào mà không bị giới hạn.
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
            <Button variant="outline" onClick={() => setShowLoginModal(false)}>
              Đóng
            </Button>
            <Button asChild variant="outline">
              <Link href={`/create-account?redirect=${encodeURIComponent(returnUrl)}`}>
                Đăng ký
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/login?redirect=${encodeURIComponent(returnUrl)}`}>
                Đăng nhập ngay
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Insufficient Balance Modal (R4) */}
      <Dialog
        open={Boolean(activeInsufficientFunds)}
        onOpenChange={(open) => !open && setInsufficientFunds(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-5 h-5" />
              Số dư ví không đủ
            </DialogTitle>
            <DialogDescription>
              Số dư ví hiện tại của bạn không đủ để thanh toán cho{' '}
              {productTitle ? `tài nguyên "${productTitle}"` : 'tài nguyên này'}. Vui lòng nạp thêm tiền vào ví để hoàn tất giao dịch.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-muted/60 p-4 space-y-2.5 text-sm my-2 border">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Đơn giá tài nguyên:</span>
              <span className="font-semibold text-foreground font-mono">
                {(activeInsufficientFunds?.required ?? numericPrice).toLocaleString('vi-VN')} ₫
              </span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Số dư ví hiện tại:</span>
              <span className="font-semibold text-foreground font-mono">
                {(activeInsufficientFunds?.balance ?? 0).toLocaleString('vi-VN')} ₫
              </span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center text-rose-600 dark:text-rose-400 font-medium">
              <span>Số tiền cần nạp thêm:</span>
              <span className="font-bold text-base font-mono">
                {(activeInsufficientFunds?.shortfall ?? 0).toLocaleString('vi-VN')} ₫
              </span>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => setInsufficientFunds(null)}
            >
              Để sau
            </Button>
            <Button asChild variant="outline">
              <Link
                href="/wallet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5"
              >
                <Wallet className="w-4 h-4" />
                Nạp tiền vào ví
              </Link>
            </Button>
            <Button
              type="button"
              disabled={isPurchasing}
              onClick={() => {
                setInsufficientFunds(null)
                void handlePurchase()
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${isPurchasing ? 'animate-spin' : ''}`} />
              Đã nạp tiền, thử lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
