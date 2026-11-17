import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata('/dictation')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
