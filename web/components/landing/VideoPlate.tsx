'use client'
// Fig. 3: the launch video as a native <video>; a dithered poster sits over it until play (controls stay clickable).
import { useState } from 'react'
import DitherImage from '@/components/dither/DitherImage'
import Figure from '@/components/dither/Figure'
import { FIG3 } from '@/lib/copy'
import styles from './VideoPlate.module.css'

export default function VideoPlate() {
  const [playing, setPlaying] = useState(false)
  const [missing, setMissing] = useState(false)
  return (
    <div className={styles.wrap}>
      <Figure n={3} caption={FIG3} aspect="16 / 9">
        <video className={styles.video} src="/video/launch-16x9.mp4" preload="metadata" playsInline controls onPlay={() => setPlaying(true)} onError={() => setMissing(true)} />
        {!playing && (
          <div className={styles.poster}>
            <DitherImage src="/video/poster.png" alt="Launch video poster: the mesh at the end card" depth={0.6} />
          </div>
        )}
        {missing && process.env.NODE_ENV !== 'production' && <p className={styles.note}>video renders in the next phase</p>}
      </Figure>
    </div>
  )
}
