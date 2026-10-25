// The /sim/ legend's plate twins [spec §7.4.2]: the same HaloRing, Diamond and Reticle the Fig. 1
// plate floats, rendered as <dt>/<dd> rows for the Legend's <dl>. Nothing hand-drawn.
import Diamond from '@/components/dither/Diamond'
import HaloRing from '@/components/dither/HaloRing'
import Reticle from '@/components/dither/Reticle'

export default function LegendTwins() {
  return (
    <>
      <dt><Reticle title="selected" /></dt><dd>selected peer</dd>
      <dt><HaloRing size={16} band={2} cell={2} /></dt><dd>honest · halo = score</dd>
      <dt><HaloRing size={16} band={0} flame cell={2} /></dt><dd>score &lt; 0</dd>
      <dt><Diamond size={12} label="attacker" /></dt><dd>attacker</dd>
      <dt><Diamond size={12} pruned label="pruned attacker" /></dt><dd>pruned attacker</dd>
    </>
  )
}
