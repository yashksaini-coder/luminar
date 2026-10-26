'use client'
// How it works (landing redesign ★6): Simulate → Stream → Render as an ordered list of three step cards.
// The connectors act out the flow (design-to-motion B4 "pipeline"): a signal pulse travels each wire left to
// right (top to bottom below 1024 px) and the next step's badge lights as it lands. One CSS clock drives all of
// it; the section carries data-play only while on screen, so the clock pauses off screen. Reduced motion: no
// pulses, the still pipeline. Facts from backend/gossip/engine.py and the README (spec "Facts").
import { type CSSProperties, useEffect, useRef } from 'react'
import { REPO_URL } from '@/lib/copy'
import styles from './HowItWorks.module.css'

const at = (i: number) => ({ '--i': i }) as CSSProperties

export interface Step { name: string; title: string; body: string; chips: string[]; facts: [string, string][] }

export const STEPS: Step[] = [
  {
    name: 'Simulate',
    title: 'A trio engine runs every peer',
    body: 'Python keeps a GossipSub v1.1 mesh for each simulated peer, runs the heartbeat, scores P1–P4 and applies the faults you inject.',
    chips: ['Python 3.12', 'trio', 'GossipSub v1.1', 'P1–P4'],
    facts: [['mesh', 'D 6 · low 4 · high 8'], ['heartbeat', '1 s'], ['peers', '20 · 50 · 100 · 200']],
  },
  {
    name: 'Stream',
    title: 'One socket carries every event',
    body: 'FastAPI sends each event down one WebSocket as orjson frames, twenty times a second. The recorder writes the same frames to a JSONL file.',
    chips: ['FastAPI', 'WebSocket', 'orjson', 'JSONL'],
    facts: [['endpoint', '/ws/events'], ['rate', '20 Hz'], ['recording', '<name>.jsonl']],
  },
  {
    name: 'Render',
    title: 'The browser draws the mesh',
    body: 'Next.js renders the peers with deck.gl, or Canvas 2D when the browser has no WebGL. Recordings replay the same frames offline, with no backend.',
    chips: ['Next.js 16', 'React 19', 'deck.gl 9', 'Canvas 2D'],
    facts: [['live', '/sim/'], ['offline', '/reels/<name>/'], ['fallback', 'Canvas 2D']],
  },
]

export default function HowItWorks() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { el.dataset.play = '1'; return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.dataset.play = '1'; else delete el.dataset.play
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} id="how" data-reveal="" aria-labelledby="how-h" className={styles.section}>
      <p className={styles.kicker} data-k="up" style={at(0)}>How it works</p>
      <h2 id="how-h" className={styles.h2} data-k="up" style={at(1)}>Simulate, stream, render.</h2>
      <p className={styles.lead} data-k="up" style={at(2)}>One Python engine, one WebSocket, one browser tab. The frames that drive the live view are the frames every recording replays.</p>
      <ol className={styles.pipe}>
        {STEPS.map((s, n) => (
          <li key={s.name} className={styles.step} data-k="card" style={{ ...at(3 + n), '--n': n } as CSSProperties}>
            <div className={styles.head}>
              <span className={styles.badge} aria-hidden="true">{`0${n + 1}`}</span>
              <span className={styles.name}>{s.name}</span>
            </div>
            <h3 className={styles.h3}>{s.title}</h3>
            <p className={styles.body}>{s.body}</p>
            <ul className={styles.chips} aria-label={`${s.name} stack`}>
              {s.chips.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <dl className={styles.facts}>
              {s.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
            {n < STEPS.length - 1 && (
              <span className={styles.wire} aria-hidden="true">
                <svg className={styles.line}>
                  <line className={styles.lx} x1="0" y1="50%" x2="100%" y2="50%" />
                  <line className={styles.ly} x1="50%" y1="0" x2="50%" y2="100%" />
                </svg>
                <span className={styles.run}><i /></span>
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className={styles.more} data-k="up" style={at(6)}>
        <a className="chev" href={`https://${REPO_URL}`}>Read the source <span aria-hidden="true">›</span></a>
      </div>
    </section>
  )
}
