import { store, timelineTotal } from '../store'
import * as api from '../api/client'
import { formatTime } from '../format'
import { pauseReel, playReel, seekReelToSimTime, setReelSpeed } from '../api/replay'
import { narratorOnScenario } from './narrator'

let timeline: HTMLInputElement
let scrubber: HTMLElement
let bubble: HTMLElement | null
let tlCurrent: HTMLElement
let tlTotal: HTMLElement
let playIcon: HTMLElement
let pauseIcon: HTMLElement

export function initPlayback() {
  timeline = document.getElementById('timeline') as HTMLInputElement
  scrubber = document.getElementById('tl-scrubber')!
  bubble = scrubber.querySelector('.lm-tl-bubble')
  tlCurrent = document.getElementById('tl-current')!
  tlTotal = document.getElementById('tl-total')!
  playIcon = document.getElementById('icon-play')!
  pauseIcon = document.getElementById('icon-pause')!

  // Play/pause
  document.getElementById('btn-play')!.addEventListener('click', togglePlay)

  // Reset
  document.getElementById('btn-reset')!.addEventListener('click', () => {
    // t=0 holds only the edges frame; the first snapshot is what repaints the map
    if (store.reel) { pauseReel(); seekReelToSimTime(0); store.playing = false; updatePlaybackUI(); return }
    document.dispatchEvent(new CustomEvent('luminar:sim-action'))  // leaves Geo so the reset is visible
    api.simReset()  // fire and forget
    store.simTime = 0
    store.simState = 'stopped'
    store.playing = false
    store.events = []
    store.eventCount = 0
    store.highlightPeers = []
    store.selectedNode = -1
    store.milestones = []
    narratorOnScenario()  // narrator latches/beats/ticker only reset on a scenario frame otherwise
    // Reset timeline slider to 0
    timeline.value = '0'
    updatePlaybackUI()
    // Clear event log
    const logList = document.getElementById('event-log-list')
    if (logList) logList.textContent = ''
    // Re-render graph
    document.dispatchEvent(new CustomEvent('luminar:render'))
  })

  // Timeline scrub
  timeline.addEventListener('input', () => {
    const pct = Number(timeline.value) / Number(timeline.max)
    const total = timelineTotal()
    const seekTime = pct * total
    syncScrubber(seekTime)
    if (store.reel) { seekReelToSimTime(seekTime); return }
    api.simSeek(seekTime)
    store.simTime = seekTime
  })

  // Speed preset buttons
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const speed = parseFloat((btn as HTMLElement).dataset.speed ?? '1')
      store.simSpeed = speed
      if (store.reel) setReelSpeed(speed)
      else api.simSpeed(speed)  // fire and forget
      // Update active state
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })
}

export function togglePlay() {
  if (store.reel) {
    if (store.playing) pauseReel(); else playReel()
    store.playing = !store.playing
    store.simState = store.playing ? 'running' : 'paused'
    updatePlaybackUI()
    return
  }
  if (store.playing) {
    api.simPause()  // fire and forget
    store.playing = false
    store.simState = 'paused'
  } else {
    api.simPlay()  // fire and forget
    store.playing = true
    store.simState = 'running'
  }
  updatePlaybackUI()
}

export function updatePlaybackUI() {
  // Icon swap
  if (store.playing) {
    playIcon.style.display = 'none'
    pauseIcon.style.display = 'block'
  } else {
    playIcon.style.display = 'block'
    pauseIcon.style.display = 'none'
  }

  // Time display (a reel's total is its recorded sim length, not the duration preset)
  const total = timelineTotal()
  tlCurrent.textContent = formatTime(store.simTime)
  tlTotal.textContent = formatTime(total)

  // Timeline position
  if (store.simTime > 0) {
    const maxTime = Math.max(total, 1)  // prevent division by zero
    const pct = Math.min(1, store.simTime / maxTime) * Number(timeline.max)
    timeline.value = String(Math.floor(pct))
  }

  syncScrubber(store.simTime)

  // Speed button active state sync
  document.querySelectorAll('.speed-btn').forEach(btn => {
    const speed = parseFloat((btn as HTMLElement).dataset.speed ?? '0')
    btn.classList.toggle('active', speed === store.simSpeed)
  })
}

/** The range input is an invisible hit layer; fill, head and bubble follow --tl-pct. */
function syncScrubber(simTime: number) {
  const pct = (Number(timeline.value) / Number(timeline.max)) * 100
  scrubber.style.setProperty('--tl-pct', pct.toFixed(2) + '%')
  if (bubble) bubble.textContent = formatTime(simTime)
}
