'use client'
// Quick start (landing redesign §13): Local · Docker · Offline as WAI-ARIA tabs over one terminal card. Commands and
// ports from README.md and docker-compose.yml. Story (design-to-motion B4, prompt): the panel's commands type in
// once the card is on screen and again on every tab switch; the caret blinks on the idle prompt; off screen it
// pauses; reduced motion shows the typed panel at rest.
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { REPO_URL } from '@/lib/copy'
import { REEL_MANIFEST, reelHref } from '@/lib/reels'
import styles from './QuickStart.module.css'

export interface Line { cmd: string; note?: string }
export interface Tab { id: string; label: string; lines: Line[]; opens: string; needs: string }

const CLONE: Line[] = [{ cmd: `git clone https://${REPO_URL}` }, { cmd: 'cd luminar' }]
export const TABS: Tab[] = [
  { id: 'local', label: 'Local', needs: 'Python 3.12 with uv · Node 22 with npm', opens: 'http://localhost:3000/sim/',
    lines: [...CLONE, { cmd: 'make install', note: 'uv sync + npm ci, about a minute' }, { cmd: 'make dev', note: 'backend :8000 + web :3000' }] },
  { id: 'docker', label: 'Docker', needs: 'Docker only', opens: 'http://localhost:8080',
    lines: [...CLONE, { cmd: 'docker compose up --build', note: 'site and backend in one container' }] },
  { id: 'offline', label: 'Offline', needs: 'Node 22 with npm · no backend, no Wi-Fi', opens: 'http://localhost:3000/reels/sybil-eclipse/',
    lines: [...CLONE, { cmd: 'cd web' }, { cmd: 'npm ci' }, { cmd: 'npm run dev', note: 'the web half only' }] },
]
export const copyText = (t: Tab) => t.lines.map(l => l.cmd).join('\n')

export const COPIED_MS = 1500
const MS_PER_CHAR = 26, LINE_GAP = 280

/** Typing schedule: each line starts once the one before has typed, plus a beat; `at` is when the caret line shows. */
export function schedule(t: Tab): { timed: number[]; at: number } {
  const timed = t.lines.map((_, i) => t.lines.slice(0, i).reduce((ms, l) => ms + l.cmd.length * MS_PER_CHAR + LINE_GAP, 0))
  const last = t.lines[t.lines.length - 1]
  return { timed, at: timed[timed.length - 1] + last.cmd.length * MS_PER_CHAR + LINE_GAP }
}

const PORTS: [string, string][] = [
  [':3000', 'Next.js site: /sim/ and /reels/'],
  [':8000', 'FastAPI: REST and /ws/events at 20 Hz'],
  [':8080', 'Docker: both halves in one container'],
]

const up = (i: number) => ({ 'data-k': 'up', style: { '--i': i } as CSSProperties })

export default function QuickStart() {
  const ref = useRef<HTMLElement>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const [sel, setSel] = useState(0)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const tab = TABS[sel]

  useEffect(() => {   // typing and caret run only while ≥30% of the section is on screen
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => {
      if (e.intersectionRatio >= 0.3) el.dataset.play = ''
      else if (!e.isIntersecting) delete el.dataset.play
    }, { threshold: [0, 0.3] })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (copy === 'idle') return
    const id = setTimeout(() => setCopy('idle'), COPIED_MS)
    return () => clearTimeout(id)
  }, [copy])

  const pick = (i: number) => { setSel(i); setCopy('idle'); tabs.current[i]?.focus() }
  const onKey = (e: KeyboardEvent) => {
    const n = TABS.length
    const to = { ArrowRight: (sel + 1) % n, ArrowLeft: (sel - 1 + n) % n, Home: 0, End: n - 1 }[e.key]
    if (to === undefined) return
    e.preventDefault(); pick(to)
  }
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(copyText(tab)); setCopy('copied') } catch { setCopy('failed') }
  }

  const { timed, at } = schedule(tab)

  return (
    <section ref={ref} id="quick-start" data-reveal="" aria-labelledby="qs-h" className={styles.section}>
      <div className={styles.intro}>
        <p className={styles.kicker} {...up(0)}>Quick start</p>
        <h2 id="qs-h" className={styles.h2} {...up(1)}>Running in about a minute.</h2>
        <p className={styles.lead} {...up(2)}>Clone, install, start. The simulator runs on your laptop, and every recording plays in the browser with no backend at all.</p>
        <dl className={styles.ports} {...up(3)}>
          {PORTS.map(([p, what]) => <div key={p}><dt>{p}</dt><dd>{what}</dd></div>)}
        </dl>
        <div className={styles.links} {...up(4)}>
          <a className="chev" href={`https://${REPO_URL}`}>Browse the source <span aria-hidden="true">›</span></a>
          <a className="chev" href="/sim/">Open the simulator <span aria-hidden="true">›</span></a>
        </div>
      </div>

      <div className={styles.term} data-k="card" style={{ '--i': 2 } as CSSProperties}>
        <div className={styles.bar}>
          <div role="tablist" aria-label="Install method" className={styles.tabs} onKeyDown={onKey}>
            {TABS.map((t, i) => (
              <button key={t.id} ref={b => { tabs.current[i] = b }} type="button" role="tab" id={`qs-tab-${t.id}`}
                aria-selected={i === sel} aria-controls={`qs-panel-${t.id}`} tabIndex={i === sel ? 0 : -1}
                className={styles.tab} onClick={() => pick(i)}>{t.label}</button>
            ))}
          </div>
          <button type="button" className={styles.copy} data-state={copy} onClick={onCopy}
            aria-label={`Copy the ${tab.label.toLowerCase()} commands`}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              {copy === 'copied'
                ? <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                : <path d="M5.5 5.5h7v7h-7zM3.5 10.5v-7h7" fill="none" stroke="currentColor" strokeWidth="1.2" />}
            </svg>
            <span>{copy === 'copied' ? 'Copied' : copy === 'failed' ? 'Select and copy' : 'Copy'}</span>
          </button>
          <span className="sr-only" role="status" aria-live="polite">{copy === 'copied' ? 'Commands copied to the clipboard' : copy === 'failed' ? 'Copy failed: select the commands and copy them by hand' : ''}</span>
        </div>

        <div key={tab.id} role="tabpanel" id={`qs-panel-${tab.id}`} aria-labelledby={`qs-tab-${tab.id}`} tabIndex={0} className={styles.panel}>
          <pre className={styles.lines}><code>
            {tab.lines.map((l, i) => (
              <span key={i} className={styles.line} style={{ '--n': l.cmd.length, '--d': `${timed[i]}ms`, '--t': `${l.cmd.length * MS_PER_CHAR}ms` } as CSSProperties}>
                <span className={styles.prompt} aria-hidden="true">$ </span><span className={styles.cmd}>{l.cmd}</span>
                {l.note && <span className={styles.cmt}>{`  # ${l.note}`}</span>}
              </span>
            ))}
            <span className={styles.line} style={{ '--d': `${at}ms` } as CSSProperties} aria-hidden="true">
              <span className={styles.prompt}>$ </span><span className={styles.caret} />
            </span>
          </code></pre>
          <p className={styles.opens} style={{ '--d': `${at}ms` } as CSSProperties}>
            <span className={styles.dot} aria-hidden="true" />Opens <code>{tab.opens}</code>
            <span className={styles.needs}>Needs {tab.needs}</span>
          </p>
        </div>

        {tab.id === 'offline' && (
          <ul className={styles.reels} aria-label="Recordings you can play here">
            {REEL_MANIFEST.map(r => <li key={r.name}><a href={reelHref(r.name)}>{`/reels/${r.name}/`}</a></li>)}
          </ul>
        )}
      </div>
    </section>
  )
}
