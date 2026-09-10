import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { I18nProvider } from '@/components/I18nProvider'

import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'CAD Drive Demo · Next.js + cad-simple-viewer',
  description:
    'Demo: chunked upload, SQLite, server-side ACEX prerender, live vs prerendered viewing',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  )
}
