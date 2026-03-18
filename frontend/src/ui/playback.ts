import { store } from '../store'
import * as api from '../api/client'
import { formatTime } from '../format'

let timeline: HTMLInputElement
let tlCurrent: HTMLElement
let tlTotal: HTMLElement
let playIcon: HTMLElement
let pauseIcon: HTMLElement

export function initPlayback() {
  timeline = document.getElementById('timeline') as HTMLInputElement
  tlCurrent = document.getElementById('tl-current')!
  tlTotal = document.getElementById('tl-total')!
  playIcon = document.getElementById('icon-play')!
  pauseIcon = document.getElementById('icon-pause')!

  // Play/pause
  document.getElementById('btn-play')!.addEventListener('click', togglePlay)

  // Reset
  document.getElementById('btn-reset')!.addEventListener('click', () => {
    api.simReset()  // fire and forget
    store.simTime = 0
    store.simState = 'stopped'
    store.playing = false
    store.events = []
    store.eventCount = 0
    store.highlightPeers = []
    store.selectedNode = -1
    store.milestones = []
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
    const seekTime = pct * store.maxDuration
    api.simSeek(seekTime)
    store.simTime = seekTime
  })

  // Speed preset buttons
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const speed = parseFloat((btn as HTMLElement).dataset.speed ?? '1')
      store.simSpeed = speed
      api.simSpeed(speed)  // fire and forget
      // Update active state
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })
}

export function togglePlay() {
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

  // Time display
  tlCurrent.textContent = formatTime(store.simTime)
  tlTotal.textContent = formatTime(store.maxDuration)

  // Timeline position
  if (store.simTime > 0) {
    const maxTime = Math.max(store.maxDuration, 1)  // prevent division by zero
    const pct = Math.min(1, store.simTime / maxTime) * Number(timeline.max)
    timeline.value = String(Math.floor(pct))
  }

  // Speed button active state sync
  document.querySelectorAll('.speed-btn').forEach(btn => {
    const speed = parseFloat((btn as HTMLElement).dataset.speed ?? '0')
    btn.classList.toggle('active', speed === store.simSpeed)
  })
}
