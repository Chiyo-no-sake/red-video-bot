import { Bot } from 'grammy'
import TelegramService from '../tg-client/TelegramService.js'
import { RedVideoBotConfig } from '../config/Config.js'
import fs from 'fs'
import prettyBytes from 'pretty-bytes'
import bigInt from 'big-integer'
import EjsEngine from '../template/mustacheEngine.js'
import { OpenAIGenerator } from '../name-generator/OpenAIGenerator.js'
import mime from 'mime-types'
import { Chat } from 'grammy/types'


export const startBot = async (
  config: RedVideoBotConfig,
  tg: TelegramService,
  nameGenerator: OpenAIGenerator
) => {
  const bot = new Bot(config.auth.botToken)
  const templateEngine = new EjsEngine();

  bot.command('start', (ctx) => ctx.reply('Ciao! Inviami un video per scaricarlo al tuo raspberry py'))

  bot.on('message:video', async (ctx) => {
    if (!ctx.message.video.file_id) return ctx.reply('No file id found!')

    const messageId = ctx.message.forward_from_message_id || ctx.message.message_id

    const fileSize = prettyBytes(ctx.message.video.file_size!)
    const fileName = await nameGenerator.generateName(JSON.stringify(ctx.message, null, 2))

    // render info message
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

    let chatName
    if (ctx.message.forward_from_message_id) {
      if (ctx.message.forward_from_chat.type === 'group') {
        chatName = ctx.message.forward_from_chat.title
      } else {
        chatName = ctx.message.forward_from_chat.username || ((ctx.message.chat as Chat.GroupChat).title || (ctx.message.chat as Chat.PrivateChat).username)
      }
    } else {
      chatName = (ctx.message.chat as Chat.GroupChat).title || (ctx.message.chat as Chat.PrivateChat).username
    }

    

    if(chatName == ctx.message.from.username)
      chatName = 'RedVideoDL_bot'

    let lastMsg = ''
    const { buffer, fileName: _, mimeType } = await tg.downloadMediaFromMessage(
      {
        chatName: chatName,
        msgId: messageId,
      },
      async (progress, total) => {
        const progressPercentage = progress
          .multiply(100)
          .divide(total)
          .toJSNumber()
        const elapsedSeconds = (Date.now() - start) / 1000
        const speed = prettyBytes(progress.toJSNumber() / elapsedSeconds) + '/s'

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
          lastMsg = fileStatus
        }
      }
    )

    await ctx.api.editMessageText(
      ctx.chat.id,
      percentMessageId!,
      templateEngine.renderProgressInfo({
        progressPercentage: 100,
        progress: prettyBytes(lastSentProgress.toJSNumber()),
        total: prettyBytes(lastSentProgress.toJSNumber()),
        speed: prettyBytes(0) + '/s',
      }),
      { parse_mode: 'HTML' }
    )

    const extension = mime.extension(mimeType)
    const finalName = `${fileName}.${extension}`

    ctx.reply(`Saving video to ${config.videoDir + '/' + (finalName)}`)
    const writeStream = fs.createWriteStream(
      config.videoDir + '/' + (fileName)
    )
    writeStream.write(buffer)
    writeStream.on('finish', () => {
      console.log('wrote all data to file')
      ctx.reply(
        `Video saved`
      )
    })
    writeStream.end()
  })

  await bot.start()
}
