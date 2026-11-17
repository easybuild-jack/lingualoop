import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata('/grammar')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
