'use client'
// Observability (landing redesign §10, replaces Same names): the two CLEAN stills (no dither) in
// browser-window frames, and a terminal card with the seven gossipsub_* series as /metrics declares
// them (backend/otel/metrics.py: kinds verbatim) plus `make otel-up` and its ports
// (deploy/otel/docker-compose.yml). Stills resolve from a flat skeleton on load; no story (addendum §3).
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { SAME_NAMES } from '@/lib/copy'
import styles from './Observability.module.css'

const k = (kind: string, i: number) => ({ 'data-k': kind, style: { '--i': i } as CSSProperties })

/** `# TYPE` lines in the order /metrics prints them: counters sorted, then the gauge, then the histogram. */
export const SERIES: [string, string][] = [
  ['gossipsub_mesh_peer_churn_events', 'counter'],
  ['gossipsub_mesh_peer_inclusion_events', 'counter'],
  ['gossipsub_topic_iwant_msgs', 'counter'],
  ['gossipsub_topic_msg_published', 'counter'],
  ['gossipsub_topic_msg_recv_counts', 'counter'],
  ['gossipsub_mesh_peer_counts', 'gauge'],
  ['gossipsub_score_per_mesh', 'histogram'],
]
export const CURL = "curl -s localhost:8000/metrics | grep '^# TYPE gossipsub_'"
export const OTEL_UP = 'make otel-up'
export const COPIED_MS = 1500
const PORTS: [string, string][] = [['Jaeger', ':16686'], ['Prometheus', ':9090'], ['Grafana', ':3000']]

const SHOTS = [
  { src: '/stills/grafana.png', title: 'Grafana · luminar', alt: 'Grafana dashboard of Luminar’s /metrics: mesh peers per topic, churn by reason, score distribution, delivery ratio and propagation, with the scenario phases marked', caption: 'Grafana over the bundled Prometheus: mesh degree, churn by reason, score buckets, delivery ratio.' },
  { src: '/stills/jaeger.png', title: 'Jaeger · gossipsub.publish', alt: 'Jaeger trace timeline of one gossipsub.publish: 50 spans, depth 5, 131 ms, each forward a child span', caption: 'Jaeger: one publish as an OTLP trace, every forward a span. 50 spans, depth 5, 131 ms.' },
]

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), COPIED_MS)
    return () => clearTimeout(t)
  }, [state])
  const copy = () => navigator.clipboard.writeText(text).then(() => setState('done'), () => setState('fail'))
  return (
    <>
      <button type="button" className={styles.copy} data-state={state} onClick={copy} aria-label={`Copy ${label}`}>
        {state === 'done' ? 'copied' : state === 'fail' ? 'copy failed' : 'copy'}
      </button>
      <span role="status" className="sr-only">{state === 'done' ? `${label} copied` : state === 'fail' ? 'Copy failed. Select the text instead.' : ''}</span>
    </>
  )
}

function Dots() {
  return <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
}

function Shot({ src, title, alt, caption, i }: (typeof SHOTS)[number] & { i: number }) {
  const ref = useRef<HTMLImageElement>(null)
  // a cached image can finish before hydration attaches onLoad
  useEffect(() => { const img = ref.current; if (img?.complete) img.dataset.loaded = '1' }, [])
  const done = (e: { currentTarget: HTMLImageElement }) => { e.currentTarget.dataset.loaded = '1' }
  return (
    <figure className={styles.shot} {...k('card', i)}>
      <a className={styles.window} href={src} target="_blank" rel="noopener" aria-label={`${title}: open the full size screenshot in a new tab`}>
        <span className={styles.bar}><Dots /><span className={styles.title}>{title}</span><span className={styles.open} aria-hidden="true">full size ↗</span></span>
        <span className={styles.frame}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer; spec asks for a sized lazy <img> */}
          <img ref={ref} className={styles.img} src={src} alt={alt} width={1440} height={840} loading="lazy" decoding="async" onLoad={done} onError={done} />
        </span>
      </a>
      <figcaption className={styles.cap}>{caption}</figcaption>
    </figure>
  )
}

export default function Observability() {
  return (
    <section className={styles.section} data-reveal="" aria-labelledby="obs-h">
      <header className={styles.head}>
        <p className={styles.kicker} {...k('up', 0)}>Observability</p>
        <h2 id="obs-h" className={styles.h2} {...k('up', 1)}>Same names, your own dashboards</h2>
        <p className={styles.lead} {...k('up', 2)}>{`/metrics emits ${SAME_NAMES}, scraped by the bundled Prometheus and drawn in Grafana. Every simulated publish is an OpenTelemetry trace over OTLP. The names match Lighthouse; the numbers are toy constants.`}</p>
      </header>
      <div className={styles.grid}>
        {SHOTS.map((s, i) => <Shot key={s.src} {...s} i={3 + i} />)}
        <div className={styles.term} {...k('card', 5)}>
          <div className={styles.pane}>
            <div className={styles.bar}><Dots /><span className={styles.title}>curl localhost:8000/metrics</span><CopyButton text={CURL} label="the curl command" /></div>
            <pre className={styles.pre} tabIndex={0} aria-label="The seven gossipsub series /metrics declares">
              <code>
                <span className={styles.cmd}><span className={styles.ps} aria-hidden="true">$ </span>{CURL}</span>
                {SERIES.map(([n, kind]) => <span key={n} className={styles.row}><span className={styles.dim}># TYPE </span>{n} <span className={styles.dim}>{kind}</span>{'\n'}</span>)}
              </code>
            </pre>
          </div>
          <div className={styles.side}>
            <p className={styles.kicker}>Run the stack</p>
            <div className={styles.line}>
              <code className={styles.inline}><span className={styles.ps} aria-hidden="true">$ </span>{OTEL_UP}</code>
              <CopyButton text={OTEL_UP} label="make otel-up" />
            </div>
            <dl className={styles.ports}>
              {PORTS.map(([n, p]) => <div key={n}><dt>{n}</dt><dd>{p}</dd></div>)}
            </dl>
            <p className={styles.note}>Point the backend at OTLP with <code>OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318</code>. Prometheus and Grafana bind to loopback only.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
