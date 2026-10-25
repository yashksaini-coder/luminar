import { Config } from '@remotion/cli/config'

Config.setEntryPoint('./remotion/index.ts')
Config.setPublicDir('./public')
Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
