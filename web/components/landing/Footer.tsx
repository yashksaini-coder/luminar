// Landing footer: wordmark and event line, routes, source and licence, then the copyright line.
import Link from 'next/link'
import { EVENT_LINE, REPO_URL } from '@/lib/copy'
import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.brand}>
        <p className={styles.mark}>LUMINAR</p>
        <p className={styles.event}><em>{EVENT_LINE}</em></p>
      </div>
      <div>
        <h3>Routes</h3>
        <ul>
          <li><Link href="/">Landing</Link></li>
          <li><a href="/sim/">Simulator</a></li>
          <li><a href="/reels/sybil-eclipse/">Recordings</a></li>
          <li><a href="/figure/">Figure</a></li>
        </ul>
      </div>
      <div>
        <h3>Source</h3>
        <ul>
          <li><a href={`https://${REPO_URL}`}>GitHub</a></li>
          <li><a href={`https://${REPO_URL}/blob/master/LICENSE`}>MIT licence</a></li>
          <li>data: ethPandaOps (CC BY 4.0)</li>
        </ul>
      </div>
      <p className={styles.copy}>© 2026 Luminar Contributors</p>
    </footer>
  )
}
