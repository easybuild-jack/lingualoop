import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata('/roots')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
