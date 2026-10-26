// The v2 section header row (sections.module.css): a full-width grid row that reveals on its own, with the
// mono slash kicker, the serif h2 (id for aria-labelledby) and the lead, rising in reading order.
import type { CSSProperties, ReactNode } from 'react'
import s from './sections.module.css'

const up = (i: number) => ({ 'data-k': 'up', style: { '--i': i } as CSSProperties })

export default function SectionHead({ id, kicker, title, lead }: { id: string; kicker: string; title: ReactNode; lead: ReactNode }) {
  return (
    <div className={s.row} data-grid="" data-reveal="">
      <header className={s.head}>
        <p className={s.kicker} {...up(0)}><span aria-hidden="true">/</span>{kicker}</p>
        <h2 id={id} className={s.h2} {...up(1)}>{title}</h2>
        <p className={s.lead} {...up(2)}>{lead}</p>
      </header>
    </div>
  )
}
