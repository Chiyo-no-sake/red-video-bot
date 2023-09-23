import { Bot } from 'grammy'
import TelegramService from '../tg-client/TelegramService.js'
import { RedVideoBotConfig } from '../config/Config.js'
import fs from 'fs'
import prettyBytes from 'pretty-bytes'
import bigInt from 'big-integer'
import EjsEngine from '../template/mustacheEngine.js'

export const startBot = async (
  config: RedVideoBotConfig,
  tg: TelegramService
) => {
  const bot = new Bot(config.auth.botToken)
  const templateEngine = new EjsEngine();

  bot.command('start', (ctx) => ctx.reply('Ciao! Inviami un video per scaricarlo al tuo raspberry py'))

  bot.on('message:video', async (ctx) => {
    if (!ctx.message.video.file_id) return ctx.reply('No file id found!')

    const messageId =
      ctx.message.forward_from_message_id || ctx.message.message_id
    const fileName =
      ctx.message?.video.file_name ||
      ctx.message.caption ||
      ctx.message.message_id.toString()
    const fileSize = prettyBytes(ctx.message.video.file_size!)

    // Display informations about the video in markdown v2
    const videoInfo = templateEngine.renderVideoInfo({
      fileName,
      fileSize,
      duration: ctx.message.video.duration,
      fileId: ctx.message.video.file_id,
    })

    ctx.reply(videoInfo, { parse_mode: 'HTML' })

    // Download the video
    const start = Date.now()
    let percentMessageId: number | undefined = undefined
    let lastSentProgress = bigInt.zero

    let chatId
    if (ctx.message.forward_from_chat) {
      if (ctx.message.forward_from_chat.type === 'group') {
        chatId = ctx.message.forward_from_chat.title
      } else {
        chatId = ctx.message.forward_from_chat.username || ctx.message.chat.id
      }
    } else {
      chatId = ctx.message.chat.id
    }

    let lastMsg = ''
    const { buffer, fileName: addFileName } = await tg.downloadMediaFromMessage(
      {
        chatId,
        msgId: messageId,
      },
      async (progress, total) => {
        const progressPercentage = progress
          .multiply(100)
          .divide(total)
          .toJSNumber()
        const elapsedSeconds = (Date.now() - start) / 1000
        const speed = prettyBytes(progress.toJSNumber() / elapsedSeconds)

        if (progress.compare(lastSentProgress) !== 0) {
          const fileStatus = templateEngine.renderProgressInfo({
            progressPercentage,
            progress: prettyBytes(progress.toJSNumber()),
            total: prettyBytes(total.toJSNumber()),
            speed,
          })

          if (!percentMessageId) {
            percentMessageId = (await ctx.reply(fileStatus)).message_id
          } else if (lastMsg !== fileStatus) {
            await ctx.api.editMessageText(
              ctx.chat.id,
              percentMessageId,
              fileStatus,
              { parse_mode: 'HTML' }
            )
          }

          lastSentProgress = progress
        }
      }
    )

    // Save the video to disk at configured videos dir
    const writeStream = fs.createWriteStream(
      config.videoDir + '/' + (fileName || addFileName)
    )
    writeStream.write(buffer)
    writeStream.on('finish', () => {
      console.log('wrote all data to file')
      ctx.reply(
        `Video saved to ${config.videoDir + '/' + (fileName || addFileName)}`
      )
    })
    writeStream.end()
  })

  await bot.start()
}
