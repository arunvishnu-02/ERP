import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource-variable/bricolage-grotesque'
import './globals.css'

export const metadata: Metadata = { title: 'CX CRM ERP', description: 'CRM and ERP for digital marketing, website development and IT services' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-center" toastOptions={{ style: { background: 'var(--ink)', color: 'var(--bg)', border: 'none' } }} />
        </ThemeProvider>
      </body>
    </html>
  )
}
