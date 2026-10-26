/** Launch video props: zod schema for Remotion's props editor and the defaults both cuts share (A.22). */
import { z } from 'zod'
import { REPO_URL } from '../lib/copy'

export type Orientation = 'wide' | 'tall'

export const launchSchema = z.object({
  orientation: z.enum(['wide', 'tall']),
  reel: z.string(),
  repoUrl: z.string(),
})

export type LaunchProps = z.infer<typeof launchSchema>

export const LAUNCH_DEFAULTS: Omit<LaunchProps, 'orientation'> = {
  reel: 'reels/sybil-eclipse.jsonl',
  repoUrl: REPO_URL,
}
