import path from 'node:path'
import { Config } from '@remotion/cli/config'

Config.setEntryPoint('./remotion/index.ts')
Config.setPublicDir('./public')
Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
// The tsconfig '@/*' path alias, so remotion/ can import the web app's shared modules.
Config.overrideWebpackConfig(c => ({
  ...c,
  resolve: { ...c.resolve, alias: { ...(c.resolve?.alias as Record<string, string>), '@': path.resolve(process.cwd()) } },
}))
