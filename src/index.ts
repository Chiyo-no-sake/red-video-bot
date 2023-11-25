import * as dotenv from 'dotenv'
import { ConfigParser } from './config/ConfigParser.js'
import TelegramService from './tg-client/TelegramService.js'
import { startBot } from './bot/Bot.js'
import { OpenAIGenerator } from './name-generator/OpenAIGenerator.js'
import EjsEngine from './template/EjsEngine.js'
import { UIService } from './UIService.js'
import { VideoDownloader } from './download/VideoDownloader.js'
import { DownloadQueue } from './download/DownloadQueue.js'

const main = async () => {
  dotenv.config()

  const configParser = new ConfigParser(process.env)
  const config = configParser.parseConfig()

  console.log('Starting with config:', config)
  const telegram = new TelegramService({
    ...config,
    ...config.auth,
  })

  await telegram.start()
  console.log('Session restored.')

  const engine = new EjsEngine()
  const ui = new UIService(engine)
  const nameGenerator = new OpenAIGenerator(config.openai, engine)
  const videoDownloader = new VideoDownloader(config, telegram)
  const downloadQueue = new DownloadQueue(videoDownloader, ui)

  await startBot(config, nameGenerator, downloadQueue, ui)
  console.log('Bot started.')
}

main()
