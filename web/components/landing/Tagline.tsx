// Tagline reveal (landing-page-design B11, plan D7): the two honesty lines in display type. Each word
// rises from 30% to full opacity in reading order once the section is in view (lib/reveal.ts sets
// data-in). The second line's first letter is capitalised by CSS so the raw text stays lowercase and
// the honesty grep (lib/copy.test.ts) keeps matching the constant.
import { Fragment } from 'react'
import { MECHANISM, RECORDING_NOT_RUN } from '@/lib/copy'
import styles from './Tagline.module.css'

function Words({ text, from, cap }: { text: string; from: number; cap?: boolean }) {
  return text.split(' ').map((w, j) => (
    <Fragment key={j}>
      {j > 0 && ' '}
      <span data-w className={cap && j === 0 ? styles.cap : undefined} style={{ '--i': from + j } as React.CSSProperties}>{w}</span>
    </Fragment>
  ))
}

export default function Tagline() {
  return (
    <section data-reveal aria-label="Tagline" className={styles.tagline}>
      <p className={styles.line}>
        <Words text={MECHANISM} from={0} />
        <br />
        <Words text={RECORDING_NOT_RUN} from={MECHANISM.split(' ').length} cap />
      </p>
    </section>
  )
}
