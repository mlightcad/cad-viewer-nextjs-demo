'use client'

import { useI18n } from '@/components/I18nProvider'

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n()

  return (
    <div
      className={`inline-flex rounded-lg border border-zinc-300 bg-white p-0.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 ${className}`}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLocale('zh')}
        className={`rounded-md px-2.5 py-1 transition ${
          locale === 'zh'
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
        }`}
      >
        {t('langZh')}
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={`rounded-md px-2.5 py-1 transition ${
          locale === 'en'
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
        }`}
      >
        {t('langEn')}
      </button>
    </div>
  )
}
