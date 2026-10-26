'use client'
// Landing nav (v2, Axiom reference): wordmark left, centred mono slash links, one boxed CTA right, inside the
// grid rails. ≤1024 px the links fold into the full-screen menu: four reel rows with one-frame dithered cards,
// three routes (spec §7.4.1).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import DitherCanvas from '@/components/dither/DitherCanvas'
import { REPO_URL } from '@/lib/copy'
import type { ReelManifest } from '@/lib/types'
import { drawPlateFrame, type PlateFrames } from './plate-draw'
import styles from './Nav.module.css'

const GITHUB = `https://${REPO_URL}`
const ROUTES: [string, string][] = [['Simulator', '/sim/'], ['Figure', '/figure/'], ['GitHub', GITHUB]]
const trim = (p: string) => p.replace(/\/+$/, '') || '/'   // '/sim/' and '/sim' are the same page
const Slash = () => <span className={styles.slash} aria-hidden="true">/</span>

function AttackerLayer({ card }: { card: PlateFrames }) {   // attackers stay flat: never dithered
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c?.clientWidth || !c.clientHeight) return   // no size (jsdom, hidden): nothing to draw
    const ctx = c.getContext('2d')
    if (!ctx) return
    c.width = c.clientWidth; c.height = c.clientHeight
    drawPlateFrame(ctx, card, 0, c.width, c.height, 'attackers')
  }, [card])
  return <canvas ref={ref} className={styles.layer} aria-hidden="true" />
}

function Card({ card, title }: { card: PlateFrames; title: string }) {
  const [source] = useState(() => (ctx: CanvasRenderingContext2D, w: number, h: number) => { drawPlateFrame(ctx, card, 0, w, h, 'base') })
  return (
    <div className={styles.card}>
      <DitherCanvas source={source} reveal={false} cell={2} aria-label={title} />
      {card.frames[0].a.length > 0 && <AttackerLayer card={card} />}
    </div>
  )
}

export default function Nav({ reels, cards }: { reels: ReelManifest; cards: Record<string, PlateFrames> }) {
  const [open, setOpen] = useState(false)
  const path = usePathname()
  const cur = (href: string) => (path && trim(href) === trim(path) ? 'page' as const : undefined)   // B9: current page marked
  const btnRef = useRef<HTMLButtonElement>(null)
  const dlgRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const dlg = dlgRef.current!
    document.body.style.overflow = 'hidden'
    dlg.querySelector<HTMLElement>('a')?.focus()
    const close = () => { setOpen(false); btnRef.current?.focus() }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
      if (e.key !== 'Tab') return
      const links = dlg.querySelectorAll<HTMLElement>('a')
      const first = links[0], last = links[links.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    const onDown = (e: PointerEvent) => { if (!innerRef.current?.contains(e.target as Node)) close() }
    document.addEventListener('keydown', onKey)
    dlg.addEventListener('pointerdown', onDown)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
      dlg.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <header className={styles.nav}>
      <div className={styles.bar}>
        <Link href="/" className={styles.brand} aria-current={cur('/')}><span className={styles.mark} aria-hidden="true" /><span className={styles.word}>Luminar</span></Link>
        <nav className={styles.links} aria-label="Primary">
          <a href="/sim/" aria-current={cur('/sim/')}><Slash />Simulator</a>
          <Link href="/#attacks"><Slash />Attacks</Link>
          <a href={`/reels/${reels[0].name}/`} aria-current={cur(`/reels/${reels[0].name}/`)}><Slash />Recordings</a>
          <a href={GITHUB} rel="noopener" target="_blank"><Slash />GitHub</a>
        </nav>
        <div className={styles.end}>
          <a href="/sim/" className={styles.cta}>Open the simulator</a>
          <button ref={btnRef} type="button" className={styles.menuBtn} data-open={open || undefined}
            aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(o => !o)}>
            Menu <span className={styles.plus} aria-hidden="true" />
          </button>
        </div>
      </div>
      {open && (
        <div id="site-menu" ref={dlgRef} role="dialog" aria-modal="true" aria-label="Menu" className={styles.overlay}>
          <div ref={innerRef} className={styles.inner}>
            <section>
              <h2 className={styles.label}>Recordings</h2>
              <ul className={styles.rows}>
                {reels.map((reel, n) => (
                  <li key={reel.name} style={{ '--i': n } as React.CSSProperties}>
                    <a href={`/reels/${reel.name}/`} className={styles.reel} aria-current={cur(`/reels/${reel.name}/`)}>
                      <kbd>{n + 1}</kbd>
                      {cards[reel.name] ? <Card card={cards[reel.name]} title={reel.title} /> : <div className={styles.card} />}
                      <span className={styles.text}>
                        <span className={styles.name}>{reel.title}</span>
                        <span className={styles.line}>{reel.blurb}</span>
                      </span>
                      <span className={styles.tail}>{reel.real && <span className={styles.tag}>REAL</span>}<span aria-hidden="true">›</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className={styles.label}>Routes</h2>
              <ul className={styles.rows}>
                {ROUTES.map(([label, href], n) => (
                  <li key={href} style={{ '--i': reels.length + n } as React.CSSProperties}>
                    <a href={href} className={styles.route} aria-current={cur(href)} {...(href === GITHUB ? { rel: 'noopener', target: '_blank' } : {})}>
                      <span className={styles.name}>{label}</span><span aria-hidden="true">›</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </header>
  )
}
