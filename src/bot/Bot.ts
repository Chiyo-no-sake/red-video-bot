import { Bot, CommandContext, Context } from 'grammy'
import TelegramService from '../tg-client/TelegramService.js'
import { RedVideoBotConfig } from '../config/Config.js'
import fs from 'fs'
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'
import { OpenAIGenerator } from '../name-generator/OpenAIGenerator.js'
import { getAvailableSeries } from '../series_utils.js'
import { UIService } from '../UIService.js'
import { VideoInfo } from '../template/Engine.js'
import { DownloadQueue } from '../download/DownloadQueue.js'

let currentSeriesName: string | undefined = undefined

export const startBot = async (
  config: RedVideoBotConfig,
  tg: TelegramService,
  nameGenerator: OpenAIGenerator,
  downloadQueue: DownloadQueue,
  ui: UIService
) => {
  const bot = new Bot(config.auth.botToken)

  bot.command('start', (ctx) => {
    ctx.reply('Hi! Send me a video and I will download it for you 🍿')
    ui.recreate = true
  })

  bot.command('series', (ctx) => {
    seriesCommand(ctx, config, ui)
  })

  bot.command('movie', (ctx) => {
    movieCommand(ctx, ui).then(() => (ui.recreate = true))
  })

  bot.command('concurrency', (ctx) => {
    const concurrency = parseInt(ctx.msg.text.replace('/concurrency ', ''))
    if (isNaN(concurrency)) {
      ctx.reply('Invalid concurrency value')
      return
    }

    downloadQueue.setConcurrency(ctx, concurrency)
    ctx.reply('Concurrency set to ' + concurrency)
    ui.recreate = true
  })

  // callback for buttons click
  bot.on('callback_query:data', async (ctx) => {
    buttonsCallback(ctx, ui).then(() => (ui.recreate = true))
  })

  // Download a received video
  bot.on('message:video', async (ctx) => {
    onReceivedVideo(ctx, downloadQueue, nameGenerator, ui)
    ui.recreate = true
  })

  // Catch all other messages, as well as custom /stop_<id> commands
  bot.on('message', async (ctx) => {
    const text = ctx.msg.text
    if (!text) return

    if (text.startsWith('/stop_')) {
      stopCommand(ctx as any, downloadQueue, ui)
    }

    ui.recreate = true
  })

  await bot.start()
}

async function seriesCommand(
  ctx: any,
  config: RedVideoBotConfig,
  ui: UIService
) {
  try {
    // If no text is provided after command, return the list of series as buttons, so the user can choose one
    // If text is provided, set the series name to the text
    const seriesDir = config.videoDir + '/tv'
    const series = await getAvailableSeries(seriesDir)

    if (ctx.msg.text === '/series') {
      // if no series name is provided, return the list of series as buttons
      ui.sendSeriesPrompt(ctx, series)
    } else {
      // if a series name is provided, set the series name to the text
      currentSeriesName = ctx.msg.text.replace('/series ', '')
      if (currentSeriesName && !series.includes(currentSeriesName)) {
        fs.mkdirSync(seriesDir + '/' + currentSeriesName)
      }

      ui.updateMode(ctx, { mode: 'Series', seriesName: currentSeriesName })
      ui.clearSeriesPrompt(ctx)
    }
  } catch (e) {
    console.log(e)
    ctx.reply('Error: ' + (e as Error).message)
  }
}

async function movieCommand(ctx: any, ui: UIService) {
  try {
    currentSeriesName = undefined
    ui.updateMode(ctx, { mode: 'Movie', seriesName: undefined })
    ui.clearSeriesPrompt(ctx)
  } catch (e) {
    console.log(e)
    ctx.reply('Error: ' + (e as Error).message)
  }
}

async function buttonsCallback(ctx: any, ui: UIService) {
  try {
    currentSeriesName = ctx.callbackQuery.data
    ui.updateMode(ctx, { mode: 'Series', seriesName: currentSeriesName })
    ui.clearSeriesPrompt(ctx)
  } catch (e) {
    console.log(e)
    ctx.reply('Error: ' + (e as Error).message)
  }
}

async function onReceivedVideo(
  ctx: any,
  downloadQueue: DownloadQueue,
  nameGenerator: OpenAIGenerator,
  ui: UIService,
  onStart: (id: string) => void = () => {}
) {
  try {
    if (!ctx.msg.video.file_id) return ctx.reply('No file id found!')

    const fileSize = prettyBytes(ctx.msg.video.file_size!)

    const aiInfo = ctx.msg
    delete aiInfo.video.thumbnail
    delete (aiInfo.video as any).thumb
    delete (aiInfo as any).thumb
    delete (aiInfo as any).thumbnail

    const seriesName = currentSeriesName
    const videoName = await nameGenerator.generateName(
      JSON.stringify(aiInfo),
      seriesName
    )

    // render info message
    const videoInfo: VideoInfo = {
      fileName: videoName,
      fileSize,
      duration: prettyMilliseconds(ctx.msg.video.duration * 1000, {
        secondsDecimalDigits: 0,
      }),
      isSeries: !!seriesName,
      seriesName,
      fileId: ctx.msg.video.file_id,
    }

    // update UI
    ui.newFoundVideo(ctx, videoInfo)

    // Download the video
    downloadQueue.add(ctx, videoInfo, onStart)
  } catch (e) {
    console.log(e)
    ctx.reply(
      'Error downloading video: ' + (e as any).message || 'Unknown error'
    )
  }
}

function stopCommand(
  ctx: CommandContext<Context>,
  downloadQueue: DownloadQueue,
  ui: UIService
) {
  const id = ctx.msg.text.replace('/stop_', '')
  downloadQueue.stopDownload(ctx, id)
}
