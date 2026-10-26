// Landing footer (v2 item 11, Framer reference): the closing headline and CTA beside a PixelField tree (one
// publish fanning out hop by hop), then a [HOW IT WORKS] list beside a short paragraph and a STAY CONNECTED
// box, then the credit row. It replaces FinalCta, so it carries the page's last call to action. Shared with
// the 404. No event, no date beyond the copyright year.
import type { CSSProperties } from 'react'
import Cursor from '@/components/fx/Cursor'
import PixelField from '@/components/fx/PixelField'
import { REPO_URL } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import { reelHref } from '@/lib/reels'
import styles from './Footer.module.css'

const i = (n: number) => ({ '--i': n }) as CSSProperties
const GITHUB = `https://${REPO_URL}`

export const STEPS: [string, string][] = [
  ['Simulate', `${stats.peers} peers run GossipSub v1.1`],
  ['Attack', 'Sybils, an eclipse, a partition'],
  ['Score', 'P1–P4 answers every heartbeat'],
  ['Replay', 'any run, from a recording'],
]
/** tag, label, href, external */
const LINKS: [string, string, string, boolean][] = [
  ['GH', 'GitHub', GITHUB, true],
  ['IN', 'LinkedIn', 'https://www.linkedin.com/in/yashksaini', true],
  ['X', 'X / Twitter', 'https://x.com/0xcrackedDev', true],
  ['WEB', 'Website', 'https://yashksaini.vercel.app/', true],
  ['SIM', 'Simulator', '/sim/', false],
  ['REC', 'Recordings', reelHref('sybil-eclipse'), false],
  ['FIG', 'Figure', '/figure/', false],
]

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <section className={styles.close} data-grid="" data-reveal="" aria-labelledby="close-h">
        <div className={styles.pitch}>
          <p className={styles.label} data-k="up" style={i(0)}>[ Next ]</p>
          <h2 id="close-h" className={styles.h2}><span data-k="up" style={i(1)}>Watch a network</span> <span data-k="up" style={i(2)}>defend itself</span></h2>
          <div className={styles.ctas}>
            <span data-k="pop" style={i(3)}><a className={styles.primary} href="/sim/"><i aria-hidden="true" />Open the simulator</a></span>
            <span className={styles.or} aria-hidden="true" data-k="up" style={i(4)}>[or]</span>
            <span data-k="up" style={i(5)}><a className={styles.ghost} href={reelHref('sybil-eclipse')}>Watch a recording <span aria-hidden="true">›</span></a></span>
          </div>
        </div>
        <div className={styles.art}>
          <PixelField preset="tree" tint="paper" accent="signal" cell={6} speed={0.8} className={styles.tree}
            aria-label={`One publish fanning out from a single peer, hop by hop, to a crown of peers; ${stats.avgHops} hops on average in the recording`} />
          <p className={styles.chip}>Fan-out · {stats.avgHops} hops avg<Cursor /></p>
        </div>
      </section>

      <div className={styles.info} data-grid="">
        <div className={styles.how}>
          <h3 className={styles.label} id="foot-how-h">[ How it works ]</h3>
          <ol aria-labelledby="foot-how-h">
            {STEPS.map(([s, d], n) => <li key={s}><span className={styles.n}>{String(n + 1).padStart(2, '0')}</span><b>{s}</b><span className={styles.d}>{d}</span></li>)}
          </ol>
        </div>
        <p className={styles.para}>
          A Python engine runs the peers and streams every heartbeat to the browser. Inject a fault and the
          P1–P4 score decides who stays in the mesh. Save the run and it plays back anywhere, with no backend.
          {' '}<em>Same mechanism, toy constants.</em>
        </p>
        <nav className={styles.box} aria-labelledby="stay-h">
          <h3 className={styles.label} id="stay-h">Stay connected</h3>
          <ul>
            {LINKS.map(([tag, label, href, ext]) => (
              <li key={tag}>
                <a href={href} {...(ext ? { target: '_blank', rel: 'noreferrer' } : {})}>
                  <i aria-hidden="true" /><span className={styles.tag} aria-hidden="true">[{tag}]</span>{label}{ext && <span className={styles.ext} aria-hidden="true">↗</span>}
                </a>
              </li>
            ))}
          </ul>
          <p className={styles.note}><span>No account · no analytics · no cookies</span><span>Recordings run offline</span></p>
        </nav>
      </div>

      <div className={styles.base} data-grid="">
        <p>
          <span>© 2026 Luminar</span>
          <a href={`${GITHUB}/blob/master/LICENSE`}>MIT licence</a>
          <span>Data: ethPandaOps (CC BY 4.0)</span>
        </p>
        <a className={styles.top} href="#main">Back to top <span aria-hidden="true">↑</span></a>
      </div>
    </footer>
  )
}
