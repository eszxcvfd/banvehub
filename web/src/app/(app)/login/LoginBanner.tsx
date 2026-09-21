import React from 'react'
import { Download, ShieldCheck, Coins, Headphones, Star, CheckCircle2, Sparkles } from 'lucide-react'
import { LogoIcon } from '@/components/icons/logo'

export const LoginBanner: React.FC<{
  /** Real published-product count; the tile is omitted entirely when no count is available. */
  totalProducts?: number
}> = ({ totalProducts }) => {
  return (
    <div className="relative flex flex-col justify-between h-full p-7 sm:p-8 xl:p-10 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#020617] text-white overflow-hidden">
      {/* Background Ambient Glow & Architectural Grid */}
      <div className="absolute -top-24 -right-24 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(#ffffff 1px, transparent 1px), radial-gradient(#ffffff 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 10px 10px',
        }}
      />

      {/* Top Header & Tagline */}
      <div className="relative z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-xs font-semibold text-blue-300 mb-4 backdrop-blur-xs">
          <Sparkles className="size-3.5 text-amber-400" aria-hidden="true" />
          <span>Sàn giao dịch số 1 cho Kỹ sư & KTS</span>
        </div>

        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center font-bold text-white shadow-inner text-sm">
            <LogoIcon className="size-4 fill-white" aria-hidden="true" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">KienTaoHub</span>
        </div>

        <h2 className="text-xl xl:text-2xl font-black tracking-tight text-white leading-snug">
          Kho tài nguyên bản vẽ CAD, BIM & mô hình 3D bản quyền
        </h2>
        <p className="mt-2 text-xs text-slate-300/90 leading-relaxed">
          Nền tảng thương mại điện tử chuyên biệt giúp tối ưu hóa thời gian thiết kế, đẩy nhanh tiến độ dự án và quản lý tài nguyên số chuyên nghiệp.
        </p>

        {/* Value Propositions / Core Benefits */}
        <div className="mt-6 space-y-2.5">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xs transition-colors hover:bg-white/[0.08]">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5 border border-emerald-500/30">
              <Download className="size-3.5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white">Tải xuống tức thì & Lưu trữ vĩnh viễn</h3>
              <p className="text-[11px] text-slate-300/80 mt-0.5 leading-relaxed">
                Tài nguyên lập tức khả dụng trong kho lưu trữ cá nhân sau khi thanh toán. Tải lại không giới hạn mọi lúc, mọi nơi.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xs transition-colors hover:bg-white/[0.08]">
            <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 shrink-0 mt-0.5 border border-blue-500/30">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white">Kiểm duyệt kỹ thuật chuẩn xác 100%</h3>
              <p className="text-[11px] text-slate-300/80 mt-0.5 leading-relaxed">
                Toàn bộ hồ sơ AutoCAD, Revit, SketchUp được thẩm định tỷ lệ, lớp layer kỹ thuật và tính tương thích trước khi đăng tải.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xs transition-colors hover:bg-white/[0.08]">
            <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 shrink-0 mt-0.5 border border-purple-500/30">
              <Headphones className="size-3.5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white">Bảo vệ quyền lợi & Hỗ trợ kỹ thuật 24/7</h3>
              <p className="text-[11px] text-slate-300/80 mt-0.5 leading-relaxed">
                Cam kết hoàn tiền minh bạch nếu tệp lỗi không đúng mô tả. Đội ngũ kỹ sư hỗ trợ xuất và mở file nhanh qua Hotline/Zalo.
              </p>
            </div>
          </div>
        </div>
      </div>

        {/* Quick Trust Metrics */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          {typeof totalProducts === 'number' && (
            <div className="py-2 px-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <div className="font-black text-white text-sm">{`${totalProducts}+`}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Tài nguyên CAD/3D</div>
            </div>
          )}
          <div className="py-2 px-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <div className="font-black text-white text-sm">100%</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Thẩm định an toàn</div>
          </div>
          <div className="py-2 px-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <div className="font-black text-white text-sm">24/7</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Hỗ trợ kỹ thuật</div>
          </div>
        </div>
      </div>
  )
}
