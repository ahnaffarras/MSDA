import { Fragment, type ReactNode } from 'react'

/**
 * Menampilkan teks laporan dari AI (Gemini) yang biasanya berisi markdown ringan:
 * judul (#), butir (- / * / •), dan **tebal**. Tidak memakai dangerouslySetInnerHTML,
 * jadi isi laporan tidak bisa menyisipkan HTML.
 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-chalk">{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

export default function ReportText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let bullets: string[] = []

  const flush = () => {
    if (bullets.length === 0) return
    const items = bullets
    bullets = []
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1 marker:text-chalk-faint">
        {items.map((b, i) => <li key={i}>{inline(b)}</li>)}
      </ul>,
    )
  }

  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }

    const bullet = line.match(/^[-*•]\s+(.*)$/)
    if (bullet) { bullets.push(bullet[1]); continue }
    flush()

    const heading = line.match(/^#{1,4}\s+(.*)$/) || line.match(/^\*\*([^*]+)\*\*:?$/)
    if (heading) {
      blocks.push(<h4 key={`h-${blocks.length}`} className="pt-2 font-semibold text-chalk">{heading[1]}</h4>)
    } else {
      blocks.push(<p key={`p-${blocks.length}`}>{inline(line)}</p>)
    }
  }
  flush()

  return <div className="space-y-3 text-[15px] leading-relaxed text-chalk-dim max-w-[68ch]">{blocks}</div>
}
