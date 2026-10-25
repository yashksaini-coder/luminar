'use client'
// Fig. 3: the launch video as a native <video>. A dithered poster covers it (and its control bar) until
// play, so the poster is itself the play button: one click starts the video and the overlay unmounts.
// The wrapper is a reveal section (plan D2): the plate rises as a card and the play chip's square ring
// (D5) starts 600 ms after data-in; a video that fails to load disables the poster and points at the reel.
import { useRef, useState } from 'react'
import DitherImage from '@/components/dither/DitherImage'
import Figure from '@/components/dither/Figure'
import { FIG3 } from '@/lib/copy'
import { reelHref } from '@/lib/reels'
import styles from './VideoPlate.module.css'

export default function VideoPlate() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [missing, setMissing] = useState(false)
  return (
    <div className={styles.wrap} data-reveal="">
      <Figure n={3} caption={FIG3} aspect="16 / 9" kind="card" captionI={1}>
        <video ref={videoRef} className={styles.video} src="/video/launch-16x9.mp4" preload="metadata" playsInline controls onPlay={() => setPlaying(true)} onError={() => setMissing(true)} />
        {!playing && (
          <button type="button" className={styles.poster} aria-label="Play the launch video" aria-disabled={missing || undefined} onClick={() => { if (!missing) void videoRef.current?.play().catch(() => {}) }}>
            <DitherImage src="/video/poster.png" alt="Launch video poster: the mesh at the end card" depth={0.6} />
            {!missing && <span className={styles.play} aria-hidden>Play ›</span>}
          </button>
        )}
        {missing && <p className={styles.note}>The video could not load. <a href={reelHref('sybil-eclipse')}>Watch the recording instead ›</a></p>}
      </Figure>
    </div>
  )
}
