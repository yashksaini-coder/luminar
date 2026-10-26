// Attack cards (landing v2 §4, the pink dither-header cards): Sybil · Eclipse · Partition. Each card has an
// animated PixelField header (rays converging, rings closing, a field split by a gap) where flame marks only
// the attacking part, a serif title, a short paragraph, three numbers from the recordings and a full-width
// CTA bar into that recording (the eclipse bar seeks to the eclipse). Numbers: lib/reel-stats.json (the
// partition block comes from partition-heal.jsonl) and the engine constants in backend/gossip/engine.py.
import type { CSSProperties } from 'react'
import PixelField from '@/components/fx/PixelField'
import type { Preset } from '@/components/fx/pixel-field'
import type { Tint } from '@/components/fx/PixelField'
import stats from '@/lib/reel-stats.json'
import { reelHref } from '@/lib/reels'
import styles from './AttackCards.module.css'

const p = stats.partition
export interface AttackCard {
  id: string; name: string; title: string; body: string; at: string
  preset: Preset; tint: Tint; accent: Tint; art: string
  facts: [string, string][]; href: string; cta: string
}

export const CARDS: AttackCard[] = [
  {
    id: 'sybil', name: 'Sybil', at: `T+${stats.sybilAt} s`,
    title: 'Sybils pruned in two heartbeats',
    body: `${stats.sybils} attacker peers graft into honest meshes at once and flood invalid messages. P4 scoring sinks them below the prune bar and the mesh drops them.`,
    preset: 'rays', tint: 'flame', accent: 'paper',
    art: 'Flame rays converging on one honest peer: Sybils grafting in from every side',
    facts: [[String(stats.sybils), 'Sybils grafted'], [String(stats.heartbeatsToPrune), 'heartbeats to prune'], [`${stats.deliveryPct}%`, 'delivery held']],
    href: reelHref('sybil-eclipse'), cta: 'Watch the Sybil recording',
  },
  {
    id: 'eclipse', name: 'Eclipse', at: `T+${stats.eclipseAt} s`,
    title: 'An eclipse scoring cannot see',
    body: `Silent attackers take every mesh slot around ${stats.eclipseTarget.replace('-', '\u2011')}. They send nothing invalid, so P4 never fires; only clearing the fault frees the peer.`,
    preset: 'rings', tint: 'flame', accent: 'paper',
    art: `Flame rings closing on a single peer at the centre: ${stats.eclipseTarget} surrounded`,
    facts: [[stats.eclipseTarget, 'eclipsed'], ['−0.25', 'attacker score floor'], [`${stats.healedInS} s`, 'to heal after the clear']],
    href: reelHref('sybil-eclipse', new URLSearchParams({ t: String(stats.eclipseAt) })), cta: 'Watch the eclipse',
  },
  {
    id: 'partition', name: 'Partition', at: `T+${p.splitAt} s`,
    title: 'One mesh, cut in half, then healed',
    body: `The cut drops every link between two halves of ${p.peers} peers. Each half keeps gossiping alone until T+${p.clearedAt} s, when the mesh grafts itself back together.`,
    preset: 'split', tint: 'signal', accent: 'flame',
    art: 'A field of signal cells split by a breathing flame gap: two halves that cannot reach each other',
    facts: [[`${p.cutDeliveryPct}%`, 'delivery while cut'], [`${p.clearedAt - p.splitAt} s`, 'cut held'], [`${p.healedInS} s`, 'to heal']],
    href: reelHref('partition-heal'), cta: 'Watch the partition heal',
  },
]

const i = (n: number) => ({ '--i': n }) as CSSProperties

export default function AttackCards() {
  return (
    <section id="attacks" className={styles.section} aria-labelledby="attacks-h" data-grid="">
      <header className={styles.head} data-reveal="">
        <p className={styles.kicker} data-k="up" style={i(0)}>/ Attacks</p>
        <h2 id="attacks-h" className={styles.h2} data-k="up" style={i(1)}>Three ways to break a mesh</h2>
        <p className={styles.lead} data-k="up" style={i(2)}>Each one ships as a recording that plays offline, and each can be injected live in the simulator.</p>
      </header>
      <ul className={styles.cards}>
        {CARDS.map((c, n) => (
          <li key={c.id} data-reveal="">
            <article className={styles.card} data-k="card" style={i(n)} aria-labelledby={`attack-${c.id}`}>
              <div className={styles.art}>
                <PixelField preset={c.preset} tint={c.tint} accent={c.accent} cell={8} speed={0.9} aria-label={c.art} />
                <span className={styles.tag}><span aria-hidden="true">{`0${n + 1}`} / </span>{c.name}</span>
                <span className={styles.at}>{c.at}</span>
              </div>
              <div className={styles.text}>
                <h3 id={`attack-${c.id}`} className={styles.h3}>{c.title}</h3>
                <p className={styles.body}>{c.body}</p>
                <dl className={styles.facts}>
                  {c.facts.map(([v, l]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
                </dl>
              </div>
              <a className={styles.cta} href={c.href}>{c.cta}<span aria-hidden="true">→</span></a>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}
