import React from 'react'
import { HomeLandingView } from '@/components/home/HomeLandingView'
import { homeJsonLd } from '@/lib/seo'

export default function RootPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd()).replace(/</g, '\\u003c') }}
      />
      <HomeLandingView />
    </>
  )
}
