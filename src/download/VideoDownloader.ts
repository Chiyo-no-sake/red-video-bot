import { Context } from 'grammy'
import mime from 'mime-types'
import fs from 'fs'
import { Chat } from 'grammy/types'
import { ProgressInfo, VideoInfo } from '../template/Engine.js'
import TelegramService from '../tg-client/TelegramService'
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'

export type VideoDownloaderConfig = {
  videoDir: string
}

export class VideoDownloader {
  constructor(private readonly config: VideoDownloaderConfig, private readonly tg: TelegramService) {}

  startDownload(
    ctx: Context,
    id: string,
    videoInfo: VideoInfo, 
    progressCallback: (info: ProgressInfo) => void,
    stopDownload: () => Promise<boolean> | boolean, 
    onComplete: () => void,
  ) {
    this.download(ctx, videoInfo, id, progressCallback, onComplete, stopDownload)
  }

  private async download(ctx: Context, videoInfo: VideoInfo, dlId: string, progressCallback: (info: ProgressInfo) => void, onComplete: () => void, stopDownload: () => Promise<boolean> | boolean) {
    const start = Date.now()
    if (!ctx.msg?.chat || !ctx.msg?.video || !ctx.msg?.from) {
      throw new Error('Invalid message')
    }

    let chatName =
      (ctx.msg.chat as Chat.GroupChat).title ||
      (ctx.msg.chat as Chat.PrivateChat).username

    // if the chat of the message is the user for the TelegramService, we need to change it to the bot
    if (chatName == ctx.msg.from.username) chatName = 'RedVideoDL_bot'

    const extension = mime.extension(
      ctx.msg.video.mime_type || 'application/mp4'
    )
    const finalName = `${videoInfo.fileName}.${extension}`
    const finalPath =
      this.config.videoDir +
      '/' +
      (videoInfo.isSeries ? 'tv/' + videoInfo.seriesName + '/' : 'movies/') +
      finalName

    // Create all necessary directories, if they don't exist
    const dir = finalPath.split('/')
    dir.pop()
    const dirPath = dir.join('/')
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }

    const messageDate = ctx.msg.date
    await this.tg.downloadMediaFromMessage(
      {
        chatName: chatName,
        msgDateSeconds: messageDate,
        fileSize: ctx.message?.video?.file_size || 0,
      },
      finalPath,
      // progress callback
      async (progress, total) => {
        const elapsedSeconds = (Date.now() - start) / 1000
        const speed = prettyBytes(progress.toJSNumber() / elapsedSeconds) + '/s'
        
        const progressPercentage = progress
          .multiply(100)
          .divide(total)
          .toJSNumber()

        const remainingMs =
          ((total.toJSNumber() - progress.toJSNumber()) /
            (progress.toJSNumber() / elapsedSeconds)) *
          1000
      
        const remainingSeconds =
          remainingMs === Infinity
            ? '∞'
            : prettyMilliseconds(remainingMs, { secondsDecimalDigits: 0 })

        progressCallback({
          progressPercentage,
          fileName: finalName,
          progress: prettyBytes(progress.toJSNumber()),
          total: prettyBytes(total.toJSNumber()),
          timeLeft: remainingSeconds,
          speed,
          id: dlId,
          seriesName: videoInfo.seriesName,
        })
      },
      // stop callback
      () => stopDownload(),
    )

    progressCallback({
      fileName: finalName,
      progressPercentage: 100,
      progress: videoInfo.fileSize,
      total: videoInfo.fileSize,
      speed: prettyBytes(0) + '/s',
      timeLeft: prettyMilliseconds(0),
      seriesName: videoInfo.seriesName,
      id: dlId,
    })
  }
}
