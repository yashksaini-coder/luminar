// The blinking block underscore after a stat value or a chip label (spec: stats bar, hero chip).
import styles from './fx.module.css'

export default function Cursor() {
  return <span className={styles.cursor} aria-hidden="true" />
}
