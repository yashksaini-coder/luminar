/** Props every launch-video scene takes: `export default function Scene(props: SceneProps)` (A.31). */
import type { Orientation } from '../props'
import type { ReelData } from '../reel/parse'
import type { SceneSpan } from '../timeline'

export interface SceneProps { data: ReelData; orientation: Orientation; span: SceneSpan; repoUrl: string; eventLine: string }
