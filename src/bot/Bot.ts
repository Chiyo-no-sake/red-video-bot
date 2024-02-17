import { Bot, CommandContext, Context } from 'grammy'
import TelegramService from '../tg-client/TelegramService.js'
import { RedVideoBotConfig } from '../config/Config.js'
import fs from 'fs'
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'
import { OpenAIGenerator } from '../name-generator/OpenAIGenerator.js'
import { getAvailableSeries } from '../series_utils.js'
import { UIService } from '../UIService.js'
import { UIVideoInfo } from '../template/Engine.js'
import { DownloadQueue } from '../download/DownloadQueue.js'
import { Chat } from 'grammy/types'
import mime from 'mime-types'

let currentSeriesName: string | undefined = undefined
let currentSeason: number | undefined = undefined

export const startBot = async (
  config: RedVideoBotConfig,
  nameGenerator: OpenAIGenerator,
  downloadQueue: DownloadQueue,
  ui: UIService,
  bot: Bot,
) => {
  bot.command('rename', async (ctx) => {
    renameCommand(ctx, downloadQueue, ui).then(() => (ui.recreate = true))
  })

  bot.command('start', (ctx) => {
    ctx
      .reply('Hi! Send me a video and I will download it for you 🍿')
      .then(() => (ui.recreate = true))
  })

  bot.command('series', (ctx) => {
    seriesCommand(ctx, config, ui)
  })

  bot.command('movie', (ctx) => {
    movieCommand(ctx, ui).then(() => (ui.recreate = true))
  })

  bot.command('concurrency', (ctx) => {
    concurrencyCommand(ctx, downloadQueue).then(() => (ui.recreate = true))
  })

  bot.command('season', (ctx) => {
    seasonCommand(ctx, ui).then(() => (ui.recreate = true))
  })

  // callback for buttons click
  bot.on('callback_query:data', async (ctx) => {
    buttonsCallback(ctx, ui).then(() => (ui.recreate = true))
  })

  // Download a received video
  bot.on('message:video', async (ctx) => {
    onReceivedVideo(ctx, downloadQueue, nameGenerator, ui).then(
      () => (ui.recreate = true)
    )
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

  await bot.start({
    drop_pending_updates: true,
    onStart: () => {
      downloadQueue.onBotStart();
    }
  })
}

async function seriesCommand(
  ctx: CommandContext<Context>,
  config: RedVideoBotConfig,
  ui: UIService
) {
  try {
    // If no text is provided after command, return the list of series as buttons, so the user can choose one
    // If text is provided, set the series name to the text
    const seriesDir = config.videoDir + '/tv'
    const series = await getAvailableSeries(seriesDir)
    const chatId = ctx.msg.chat.id

    if (ctx.msg.text === '/series') {
      // if no series name is provided, return the list of series as buttons
      await ui.sendSeriesPrompt(chatId, series)
    } else {
      // if a series name is provided, set the series name to the text
      currentSeriesName = ctx.msg.text.replace('/series ', '')
      if (currentSeriesName && !series.includes(currentSeriesName)) {
        fs.mkdirSync(seriesDir + '/' + currentSeriesName)
      }

      await ui.updateMode(chatId, {
        mode: 'Series',
        seriesName: currentSeriesName,
      })
      await ui.clearSeriesPrompt(chatId)
    }
  } catch (e) {
    console.log(e)
    ctx.reply('Error: ' + (e as Error).message)
  }
}

async function movieCommand(ctx: CommandContext<Context>, ui: UIService) {
  const chatId = ctx.msg.chat.id
  try {
    currentSeriesName = undefined
    await ui.updateMode(chatId, { mode: 'Movie', seriesName: undefined })
    await ui.clearSeriesPrompt(chatId)
  } catch (e) {
    console.log(e)
    ctx.reply('Error: ' + (e as Error).message)
  }
}

async function concurrencyCommand(ctx: CommandContext<Context>, downloadQueue: DownloadQueue) {
  try {
    const concurrency = parseInt(ctx.msg.text.replace('/concurrency ', ''))
    if (isNaN(concurrency)) {
      await ctx.reply('Invalid concurrency value')
      return
    }

    downloadQueue.setConcurrency(ctx, concurrency)
    await ctx.reply('Concurrency set to ' + concurrency)
  } catch (e) {
    console.log(e)
    await ctx.reply('Error: ' + (e as Error).message)
  }
}

async function buttonsCallback(ctx: Context, ui: UIService) {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    ctx.reply('No chat id found');
    return;
  }

  try {
    currentSeriesName = ctx.callbackQuery!.data
    await ui.updateMode(chatId, { mode: 'Series', seriesName: currentSeriesName })
    await ui.clearSeriesPrompt(chatId)
  } catch (e) {
    console.log(e)
    ctx.reply('Error: ' + (e as Error).message)
  }
}

async function onReceivedVideo(
  ctx: Context,
  downloadQueue: DownloadQueue,
  nameGenerator: OpenAIGenerator,
  ui: UIService,
  onStart: (id: string) => void = () => { }
) {
  try {
    if (!ctx.msg?.video?.file_id) return ctx.reply('No file id found!')

    const fileSize = prettyBytes(ctx.msg.video.file_size!)

    const aiInfo = ctx.msg
    delete aiInfo.video?.thumbnail
    delete (aiInfo.video as any).thumb
    delete (aiInfo as any).thumb
    delete (aiInfo as any).thumbnail

    const seriesName = currentSeriesName
    const videoName = await nameGenerator.generateName(
      JSON.stringify(aiInfo),
      seriesName,
      currentSeason
    )

    // render info message
    const videoInfo: UIVideoInfo = {
      fileName: videoName,
      fileSize,
      duration: prettyMilliseconds(ctx.msg.video.duration * 1000, {
        secondsDecimalDigits: 0,
      }),
      isSeries: !!seriesName,
      seriesName,
      fileId: ctx.msg.video.file_id,
    }

    if (!ctx.msg?.chat || !ctx.msg?.video || !ctx.msg?.from) {
      throw new Error('Invalid message')
    }

    let chatName =
      (ctx.msg.chat as Chat.GroupChat).title ||
      (ctx.msg.chat as Chat.PrivateChat).username

    if (!chatName) {
      console.log('No chat name found')
      ui.sendError(ctx.msg.chat.id, 'No chat name found')
    }

    // if the chat of the message is the user for the TelegramService, we need to change it to the bot
    if (chatName == ctx.msg.from.username || !chatName) chatName = 'RedVideoDL_bot'

    const extension = mime.extension(
      ctx.msg.video.mime_type || 'application/mp4'
    )

    const chatId = ctx.msg.chat.id;

    // update UI
    await ui.newFoundVideo(chatId, videoInfo)

    const ctxInfo = {
      chatName,
      msgDateSeconds: ctx.msg.date,
      fileSize: ctx.msg?.video?.file_size || 0,
      extension: extension || 'mp4',
    }

    // Download the video
    downloadQueue.add(chatId, videoInfo, ctxInfo, onStart)
  } catch (e) {
    console.log(e)
    await ctx.reply(
      'Error downloading video: ' + (e as any).message || 'Unknown error'
    )
  }
}

function stopCommand(
  ctx: CommandContext<Context>,
  downloadQueue: DownloadQueue,
  ui: UIService
) {
  try {
    const id = ctx.msg.text.replace('/stop_', '')
    downloadQueue.stopDownload(id)
  } catch (e) {
    console.log(e)
    ctx.reply(
      'Error stopping download: ' + (e as any).message || 'Unknown error'
    )
  }
}

async function seasonCommand(ctx: CommandContext<Context>, ui: UIService) {
  const chatId = ctx.msg.chat.id
  try {
    if (currentSeriesName === undefined) {
      await ui.sendError(chatId, 'Movie mode, to set season use first /series <series name>')
      return
    }

    const season = ctx.msg.text.replace('/season ', '')
    const seasonNum = parseInt(season)

    if (isNaN(seasonNum)) {
      await ui.sendError(chatId, 'Invalid season number')
      return
    }

    currentSeason = seasonNum
    await ui.updateMode(chatId, {
      mode: 'Series',
      seriesName: currentSeriesName,
      season: seasonNum,
    })

    if (seasonNum === 0) {
      await ctx.reply('Season cleared - No season')
    } else {
      await ctx.reply('Season set to ' + seasonNum)
    }
  } catch (e) {
    console.log(e)
    await ui.sendError(chatId, 'Error: ' + (e as any).message || 'Unknown error')
  }
}

async function renameCommand(
  ctx: CommandContext<Context>,
  downloadQueue: DownloadQueue,
  ui: UIService
) {
  const chatId = ctx.msg.chat.id;
  try {
    const oldAndNewNames = ctx.msg.text.replace('/rename ', '').split(' ')
    if (oldAndNewNames.length !== 2) {
      await ui.sendError(chatId, 'Invalid syntax. Use /rename <old name> <new name>')
      return
    }

    const done = downloadQueue.renameDownload(
      chatId,
      oldAndNewNames[0],
      oldAndNewNames[1]
    )

    if (!done) {
      await ui.sendError(chatId, 'No download found with name ' + oldAndNewNames[0])
    } else {
      await ctx.reply('New name: ' + oldAndNewNames[1])
    }
  } catch (e) {
    console.log(e)
    await ui.sendError(chatId, 'Error: ' + (e as any).message || 'Unknown error')
  }
}
