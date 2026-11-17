import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata('/learn')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
