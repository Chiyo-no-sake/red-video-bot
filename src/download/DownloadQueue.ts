import { Context } from 'grammy'
import { VideoDownloader } from './VideoDownloader.js'
import { ProgressInfo, ProgressInfoMultiple, VideoInfo } from '../template/Engine.js'
import { randomUUID } from 'crypto'
import { UIService } from '../UIService.js'
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'
import { toBase64 } from 'openai/core.js'

export type DownloadJob = {
  ctx: Context
  videoInfo: VideoInfo
  id: string
  progressInfo?: ProgressInfo
  stopped?: boolean,
  onStart: (id: string) => void
}

export class DownloadQueue {
  private queue: DownloadJob[] = []
  private downloading: DownloadJob[] = []

  // property with setter
  private maxConcurrentDownloads = 3
  
  constructor(
    private readonly videoDownloader: VideoDownloader,
    private readonly ui: UIService
  ) {}

  add(ctx: Context, videoInfo: VideoInfo, onStart: (id: string) => void): string {
    const job = {
      ctx: ctx,
      videoInfo: videoInfo,
      id: toBase64(randomUUID()).substring(0, 6),
      stopped: false,
      onStart
    }
    this.queue.push(job)

    if (this.downloading.length < this.maxConcurrentDownloads) {
      this.downloadNext().catch((e) => {
        console.log(e)
        ctx.reply('Error downloading video: ' + (e as any).message || 'Unknown error')
      })
    }

    return job.id
  }

  stopDownload(ctx: Context, id: string) {
    const job =
      this.downloading.find((j) => j.id == id) ||
      this.queue.find((j) => j.id == id)

    if (!job) {
      throw new Error('Job not found')
    }

    if (this.downloading.includes(job)) {
      job.stopped = true
    } else {
      this.queue = this.queue.filter((j) => j.id != id)
    }
  }

  getDownloadIds(): string[] {
    return [...this.queue, ...this.downloading].map((j) => j.id)
  }

  setConcurrency(ctx: Context, value: number) {
    this.maxConcurrentDownloads = value
    while (this.downloading.length < this.maxConcurrentDownloads) {
      this.downloadNext().catch((e) => {
        console.log(e)
        ctx.reply('Error downloading video: ' + (e as any).message || 'Unknown error')
      })
    }
  }

  private async downloadNext() {
    if (this.queue.length == 0) {
      return
    }

    const job = this.queue.shift()!
    this.downloading.push(job)
    job.onStart(job.id)
    return this.videoDownloader.startDownload(
      job.ctx,
      job.id,
      job.videoInfo,
      // on progress
      (progress) => {
        job.progressInfo = progress
        this.ui.updateProgress(job.ctx, this.getProgressStatus())
      },
      // get stop status
      () => {
        const stop = job.stopped
        if(stop) {
          this.downloading = this.downloading.filter((j) => j.id != job.id)
          this.ui.updateProgress(job.ctx, this.getProgressStatus())
        }

        return !!stop
      },
      // on complete
      () => {
        this.downloading = this.downloading.filter((j) => j.id != job.id)
        this.ui.updateProgress(job.ctx, this.getProgressStatus())
        this.downloadNext()
      }
    )
  }

  private getProgressStatus(): ProgressInfo | ProgressInfoMultiple | undefined {
    if(this.queue.length > 0 || this.downloading.length > 1){
      return {
        queue: this.queue.map((job) => {
          return {
            fileName: job.videoInfo.fileName,
            progressPercentage: 0,
            progress: prettyBytes(0),
            total: prettyBytes(0),
            speed: prettyBytes(0) + '/s',
            timeLeft: prettyMilliseconds(0),
            seriesName: job.videoInfo.seriesName,
            id: job.id,
          }
        }),
        downloading: this.downloading.map((job) => {
          return job.progressInfo || {
            id: job.id,
            fileName: job.videoInfo.fileName,
            progressPercentage: 0,
            progress: prettyBytes(0),
            total: prettyBytes(0),
            speed: prettyBytes(0) + '/s',
            timeLeft: prettyMilliseconds(0),
            seriesName: job.videoInfo.seriesName,
          }
        }),
      }
    } else if(this.downloading.length === 1) {
      return this.downloading[0].progressInfo || {
        id: this.downloading[0].id,
        fileName: this.downloading[0].videoInfo.fileName,
        progressPercentage: 0,
        progress: prettyBytes(0),
        total: prettyBytes(0),
        speed: prettyBytes(0) + '/s',
        timeLeft: prettyMilliseconds(0),
        seriesName: this.downloading[0].videoInfo.seriesName,
      }
    } else {
      return undefined
    }
  }
}
