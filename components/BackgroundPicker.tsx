'use client'

import { useId } from 'react'

import { useI18n } from '@/components/I18nProvider'
import {
  HTML_BACKGROUNDS,
  type HtmlBackground,
} from '@/lib/html-background'

const labelKey = {
  black: 'backgroundBlack',
  white: 'backgroundWhite',
  space: 'backgroundSpace',
} as const

const hintKey = {
  black: 'backgroundBlackHint',
  white: 'backgroundWhiteHint',
  space: 'backgroundSpaceHint',
} as const

type Props = {
  value: HtmlBackground
  onChange: (value: HtmlBackground) => void
  disabled?: boolean
}

export function BackgroundPicker({ value, onChange, disabled }: Props) {
  const { t } = useI18n()
  const name = useId()

  return (
    <fieldset disabled={disabled} className="mt-4 min-w-0">
      <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {t('background')}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {HTML_BACKGROUNDS.map((option) => {
          const selected = value === option
          return (
            <label
              key={option}
              title={t(hintKey[option])}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                selected
                  ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-100'
                  : 'border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-200'
              } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={selected}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {t(labelKey[option])}
            </label>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {t(hintKey[value])}
      </p>
    </fieldset>
  )
}
