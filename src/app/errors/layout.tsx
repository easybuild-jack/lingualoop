import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata('/errors')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
