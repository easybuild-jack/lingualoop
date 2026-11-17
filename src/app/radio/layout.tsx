import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata('/radio')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
