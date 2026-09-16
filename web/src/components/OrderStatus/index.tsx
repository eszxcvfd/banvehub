import type { Order } from '@/payload-types'
import { cn } from '@/utilities/cn'

export type StatusOptions = Order['status']

type Props = {
  status: StatusOptions
  className?: string
}

export const OrderStatus: React.FC<Props> = ({ status, className }) => {
  return (
    <div
      className={cn(
        'text-xs tracking-widest font-mono uppercase py-0.5 px-2.5 rounded-full w-fit font-semibold border',
        className,
        {
          'bg-amber-500/10 text-amber-600 border-amber-500/20': status === 'PENDING',
          'bg-emerald-500/10 text-emerald-600 border-emerald-500/20': status === 'COMPLETED',
          'bg-destructive/10 text-destructive border-destructive/20': status === 'CANCELLED',
          'bg-purple-500/10 text-purple-600 border-purple-500/20': status === 'REFUNDED',
        },
      )}
    >
      {status}
    </div>
  )
}
