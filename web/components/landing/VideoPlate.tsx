'use client'
// Fig. 3: the launch video as a native <video>. A dithered poster covers it (and its control bar) until
// play, so the poster is itself the play button: one click starts the video and the overlay unmounts.
import { useRef, useState } from 'react'
import DitherImage from '@/components/dither/DitherImage'
import Figure from '@/components/dither/Figure'
import { FIG3 } from '@/lib/copy'
import styles from './VideoPlate.module.css'

export default function VideoPlate() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [missing, setMissing] = useState(false)
  return (
    <div className={styles.wrap}>
      <Figure n={3} caption={FIG3} aspect="16 / 9">
        <video ref={videoRef} className={styles.video} src="/video/launch-16x9.mp4" preload="metadata" playsInline controls onPlay={() => setPlaying(true)} onError={() => setMissing(true)} />
        {!playing && (
          <button type="button" className={styles.poster} aria-label="Play the launch video" onClick={() => void videoRef.current?.play().catch(() => {})}>
            <DitherImage src="/video/poster.png" alt="Launch video poster: the mesh at the end card" depth={0.6} />
            <span className={styles.play} aria-hidden>Play ›</span>
          </button>
        )}
        {missing && process.env.NODE_ENV !== 'production' && <p className={styles.note}>video renders in the next phase</p>}
      </Figure>
    </div>
  )
}
