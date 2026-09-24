import React from 'react'

export function GeometricKLogo({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Kiến Tạo Hub Logo"
      {...props}
    >
      {/* Cột thẳng đứng kiến trúc */}
      <rect x="4" y="4" width="5.5" height="24" rx="1.5" fill="currentColor" />
      {/* Cánh chéo trên */}
      <polygon
        points="12,12.5 21.5,4.5 26.5,4.5 14.5,15.5 12,14"
        fill="currentColor"
      />
      {/* Cánh chéo dưới */}
      <polygon
        points="12,16 15,14 26.5,27.5 21.5,27.5 12,17.5"
        fill="currentColor"
      />
    </svg>
  )
}
