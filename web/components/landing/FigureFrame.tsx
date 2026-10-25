// The sorter colorfigure (Fig. 2) in an iframe: lazy inside the landing plate, full-bleed on
// /figure/; `press` passes a scripted button sequence through as ?press= (spec §4, Task 5.8).
export interface FigureFrameProps { press?: string; fullBleed?: boolean }

export default function FigureFrame({ press, fullBleed }: FigureFrameProps) {
  return (
    <iframe
      src={'/figures/sorter.html' + (press ? `?press=${encodeURIComponent(press)}` : '')}
      title="Sorting office: GossipSub as a pneumatic-tube desk"
      loading={fullBleed ? undefined : 'lazy'}
      style={fullBleed
        ? { position: 'fixed', inset: 0, width: '100vw', height: '100dvh', border: 0, background: '#f4f1e8' }
        : { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
    />
  )
}
