import * as dotenv from 'dotenv'
import { ConfigParser } from './config/ConfigParser.js'
import TelegramService from './tg-client/TelegramService.js'
import { startBot } from './bot/Bot.js'
import { OpenAIGenerator } from './name-generator/OpenAIGenerator.js'
import EjsEngine from './template/EjsEngine.js'
import { UIService } from './UIService.js'
import { VideoDownloader } from './download/VideoDownloader.js'
import { DownloadQueue } from './download/DownloadQueue.js'
import { FileKVStorage } from './storage/FileKVStorage.js'
import { Bot } from 'grammy'
import { DownloadMetadataService } from './download/DownloadMetadataService.js'

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

  const bot = new Bot(config.auth.botToken)


  const downloadMetaStorage = new FileKVStorage(config.configDir + '/dl-metadata.json');
  await downloadMetaStorage.init();

  const downloadMetaService = new DownloadMetadataService(downloadMetaStorage);

  const engine = new EjsEngine()
  const ui = new UIService(engine, bot);
  const nameGenerator = new OpenAIGenerator(config.openai, engine)
  const videoDownloader = new VideoDownloader(config, telegram)
  const downloadQueue = new DownloadQueue(videoDownloader, downloadMetaService, ui)

  await startBot(config, nameGenerator, downloadQueue, ui, bot);
  console.log('Bot stopped.')
}

main()
