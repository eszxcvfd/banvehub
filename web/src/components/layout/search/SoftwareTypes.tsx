import configPromise from '@payload-config'
import { getPayload } from 'payload'
import clsx from 'clsx'
import React, { Suspense } from 'react'

import { SoftwareTypeItem } from './SoftwareTypes.client'

async function SoftwareTypeList() {
  const payload = await getPayload({ config: configPromise })

  const softwareTypes = await payload.find({
    collection: 'software_types',
    sort: 'sortOrder',
  })

  return (
    <div>
      <h3 className="text-xs mb-2 text-neutral-500 dark:text-neutral-400">Software</h3>

      <ul>
        {softwareTypes.docs.map((software) => {
          return (
            <li key={software.id} className="mt-1">
              <SoftwareTypeItem software={software} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const skeleton = 'mb-3 h-4 w-5/6 animate-pulse rounded'
const activeAndTitles = 'bg-neutral-800 dark:bg-neutral-300'
const items = 'bg-neutral-400 dark:bg-neutral-700'

export function SoftwareTypes() {
  return (
    <Suspense
      fallback={
        <div className="col-span-2 hidden h-[200px] w-full flex-none py-4 lg:block">
          <div className={clsx(skeleton, activeAndTitles)} />
          <div className={clsx(skeleton, items)} />
          <div className={clsx(skeleton, items)} />
          <div className={clsx(skeleton, items)} />
        </div>
      }
    >
      <SoftwareTypeList />
    </Suspense>
  )
}
