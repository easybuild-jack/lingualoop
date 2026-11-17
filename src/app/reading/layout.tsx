import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata('/reading')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
