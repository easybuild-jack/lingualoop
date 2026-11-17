import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata('/translate')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
