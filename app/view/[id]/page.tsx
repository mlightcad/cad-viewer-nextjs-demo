import { ViewPageClient } from '@/components/ViewPageClient'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mode?: string }>
}

export default async function ViewPage({ params, searchParams }: Props) {
  const { id } = await params
  const { mode: raw } = await searchParams
  const mode = raw === 'prerender' ? 'prerender' : 'live'
  return <ViewPageClient drawingId={id} mode={mode} />
}
