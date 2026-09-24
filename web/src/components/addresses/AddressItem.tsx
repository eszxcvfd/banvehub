'use client'

import React from 'react'
import type { Address } from '@/payload-types'
import { CreateAddressModal } from '@/components/addresses/CreateAddressModal'
import {
  UserOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  ShopOutlined,
} from '@ant-design/icons'

type Props = {
  address: Partial<Omit<Address, 'country'>> & { country?: string }
  /**
   * Completely override the default actions
   */
  actions?: React.ReactNode
  /**
   * Insert elements before the actions
   */
  beforeActions?: React.ReactNode
  /**
   * Insert elements after the actions
   */
  afterActions?: React.ReactNode
  /**
   * Hide all actions
   */
  hideActions?: boolean
}

export const AddressItem: React.FC<Props> = ({
  address,
  actions,
  hideActions = false,
  beforeActions,
  afterActions,
}) => {
  if (!address) {
    return null
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grow space-y-1.5 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100 text-base">
            <UserOutlined className="text-[#1677ff] text-sm" />
            {address.title && <span>{address.title} </span>}
            {address.firstName} {address.lastName}
          </span>
          {address.phone && (
            <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
              <PhoneOutlined className="text-slate-400 text-[11px]" />
              {address.phone}
            </span>
          )}
        </div>

        {address.company && (
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 m-0">
            <ShopOutlined className="text-slate-400" />
            <span>{address.company}</span>
          </p>
        )}

        <div className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5 pt-0.5 leading-relaxed">
          <EnvironmentOutlined className="text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <p className="m-0 font-medium text-slate-700 dark:text-slate-200">
              {address.addressLine1}
              {address.addressLine2 && <>, {address.addressLine2}</>}
            </p>
            <p className="m-0 text-slate-500 dark:text-slate-400">
              {address.city}, {address.state} {address.postalCode}
              {address.country && <span> • {address.country}</span>}
            </p>
          </div>
        </div>
      </div>

      {!hideActions && (
        <div className="shrink-0 flex flex-col gap-2">
          {actions ? (
            actions
          ) : (
            <>
              {beforeActions}
              {address.id && (
                <CreateAddressModal
                  addressID={address.id}
                  initialData={address}
                  buttonText={'Edit'}
                  modalTitle={'Edit address'}
                />
              )}
              {afterActions}
            </>
          )}
        </div>
      )}
    </div>
  )
}
