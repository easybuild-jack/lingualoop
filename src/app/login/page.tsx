import { LoginView } from '@/components/auth/LoginView'
import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata('/login')

export default function LoginPage() {
  return <LoginView />
}
