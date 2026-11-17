import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata('/phonetics')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
