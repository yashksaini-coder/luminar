// The shot list: what the recorder films. Each shot is one page load of the real UI, seeked to a reel moment,
// played at a speed for `seconds` of video (durations match demo/SCRIPT.md). `actions` are timed
// interactions on the shot clock (seconds). Times are reel sim seconds (web/lib/reel-stats.json):
// publish 5.8, Sybils 10.2, first prune 11.9, all pruned 12.4, eclipse 16.2 on peer-10, cleared 24.1, healed +1.4.
const HERO = '/reels/sybil-eclipse/?theme=stage&hero=1'
const RAILS = '/reels/sybil-eclipse/?theme=stage'
const MAINNET = '/reels/mainnet-block-wave/?theme=stage&hero=1'

export const SHOTS = [
  // A healthy mesh: flood publish at T+5.8, slowed so every hop reads.
  { id: 'mesh', url: HERO, seek: 5.4, speed: 0.5, seconds: 9 },
  // Five Sybils graft in at T+10.2 and flood; P4 prunes them. Snapshots sit on the half second, so the seek lands
  // on T+9.4 and the clip drops its first 0.6 s (18 frames): it then runs T+9.7→13.6 and "5 · 5 pruned"
  // (T+12.4) lands 5.4 s in, on the beat (demo/SCRIPT.md).
  { id: 'sybil', url: HERO, seek: 9.4, speed: 0.5, seconds: 8.4, skipFrames: 18 },
  // The quiet attack with the rails up; the cursor clicks peer-10 so the inspector opens on the eclipsed peer.
  // (the seek lands on the T+15.9 snapshot; the glide starts at 0.8 s and the click itself lands at 1.2 s = film 22.8)
  { id: 'eclipse', url: RAILS, seek: 15.8, speed: 1, seconds: 7.8, actions: [{ at: 0.8, click: 'peer-10' }] },
  // Faults clear at T+24.1; the mesh re-grafts and the narrator stamps "Mesh healed in 1.4s" at T+25.5.
  { id: 'heal', url: RAILS, seek: 23.4, speed: 1, seconds: 6 },
  // Real mainnet block arrivals at observer nodes (Geo) at half speed. The reel clock starts at the first arrival,
  // so slot 15466393's wave sits at T+0.0–0.5 and the next slot's (15466394) at T+12.0–12.5: snapshot at T+11.0,
  // 21 frames dropped → the clip runs T+11.35→14.35 and the wave lands 1.3 s in (film 36.7).
  { id: 'mainnet', url: MAINNET, seek: 11.0, speed: 0.5, seconds: 6.7, skipFrames: 21 },
]
