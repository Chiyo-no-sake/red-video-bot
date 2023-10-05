import { Bot } from 'grammy'
import TelegramService from '../tg-client/TelegramService.js'
import { RedVideoBotConfig } from '../config/Config.js'
import fs from 'fs'
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'
import bigInt from 'big-integer'
import EjsEngine from '../template/mustacheEngine.js'
import { OpenAIGenerator } from '../name-generator/OpenAIGenerator.js'
import mime from 'mime-types'
import { Chat } from 'grammy/types'


export const startBot = async (
  config: RedVideoBotConfig,
  tg: TelegramService,
  nameGenerator: OpenAIGenerator,
  templateEngine: EjsEngine
) => {
  const bot = new Bot(config.auth.botToken)

  bot.command('start', (ctx) => ctx.reply('Ciao! Inviami un video per scaricarlo al tuo raspberry py'))

  bot.on('message:video', async (ctx) => {
    ctx.reply("Found video");
    try {
      if (!ctx.msg.video.file_id) return ctx.reply('No file id found!')

      const messageDate = ctx.msg.date;
      const fileSize = prettyBytes(ctx.msg.video.file_size!)

      const currentSeries = fs.readdirSync(config.videoDir + '/tv', { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)

      const aiInfo = ctx.msg;
      delete aiInfo.video.thumbnail;
      delete (aiInfo.video as any).thumb;
      delete (aiInfo as any).thumb;
      delete (aiInfo as any).thumbnail;
      
      const {seriesName, videoName} = await nameGenerator.generateName(JSON.stringify(aiInfo), currentSeries);

      // render info message
      const videoInfo = templateEngine.renderVideoInfo({
        fileName: videoName,
        fileSize,
        duration: prettyMilliseconds(ctx.msg.video.duration * 1000, { secondsDecimalDigits: 0 }),
        isSeries: !!seriesName,
        seriesName,
        fileId: ctx.msg.video.file_id,
      })

      ctx.reply(videoInfo, { parse_mode: 'HTML' })

      // Download the video
      const start = Date.now()
      let percentMessageId: number | undefined = undefined
      let lastSentProgress = bigInt.zero

      let chatName = (ctx.msg.chat as Chat.GroupChat).title || (ctx.msg.chat as Chat.PrivateChat).username

      // if the chat of the message is the user for the TelegramService, we need to change it to the bot
      if(chatName == ctx.msg.from.username)
        chatName = 'RedVideoDL_bot'

      const extension = mime.extension(ctx.msg.video.mime_type)
      const finalName = `${videoName}.${extension}`
      const finalPath = config.videoDir + '/' + (seriesName ? 'tv/' + seriesName + '/' : 'movies/') + finalName

      // Create all necessary directories, if they don't exist
      const dir = finalPath.split('/')
      dir.pop()
      const dirPath = dir.join('/')
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }

      ctx.reply(`Saving video to ${finalPath}`)

      let lastMsg = ''
      let lastSentTime = Date.now()
      await tg.downloadMediaFromMessage(
        {
          chatName: chatName,
          msgDateSeconds: messageDate,
        },
        finalPath,
        async (progress, total) => {
          const progressPercentage = progress
            .multiply(100)
            .divide(total)
            .toJSNumber()
          const elapsedSeconds = (Date.now() - start) / 1000
          const speed = prettyBytes(progress.toJSNumber() / elapsedSeconds) + '/s'
          const remainingMs = (total.toJSNumber() - progress.toJSNumber()) / (progress.toJSNumber() / elapsedSeconds) * 1000
          const remainingSeconds = remainingMs === Infinity ? '∞' : prettyMilliseconds(remainingMs, { secondsDecimalDigits: 0 })

          if (progress.compare(lastSentProgress) !== 0 && lastSentTime + 2000 < Date.now()) {
            lastSentTime = Date.now()
            const fileStatus = templateEngine.renderProgressInfo({
              progressPercentage,
              progress: prettyBytes(progress.toJSNumber()),
              total: prettyBytes(total.toJSNumber()),
              timeLeft: remainingSeconds,
              speed,
            })

            if (!percentMessageId) {
              percentMessageId = (await ctx.reply(fileStatus, {parse_mode: 'HTML'})).message_id
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
          timeLeft: prettyMilliseconds(0)
        }),
        { parse_mode: 'HTML' }
      )

      ctx.reply(`🍿 Video saved to ${finalPath}`)
    } catch (e) {
      console.log(e);
      ctx.reply(JSON.stringify(e, undefined, 2))
    }
  })

  await bot.start()
}
