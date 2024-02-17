import { Context } from 'grammy'
import { VideoDownloader } from './VideoDownloader.js'
import {
  UIProgressInfo,
  ProgressInfoMultiple,
  UIVideoInfo,
} from '../template/Engine.js'
import { randomUUID } from 'crypto'
import { UIService } from '../UIService.js'
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'
import { toBase64 } from 'openai/core.js'
import { DownloadJob, DownloadMetadataService } from './DownloadMetadataService.js'
import bigInt from 'big-integer'


export class DownloadQueue {
  private queue: DownloadJob[] = []
  private downloading: DownloadJob[] = []

  // property with setter
  private maxConcurrentDownloads = 3

  constructor(
    private readonly videoDownloader: VideoDownloader,
    private readonly metadataService: DownloadMetadataService,
    private readonly ui: UIService
  ) { }

  async onBotStart() {
    // list all resumable downloads
    // and sort them by queue position: first the items without queue position, then the ones with queue position in ascending order
    const resumable = (await Promise.all((await this.metadataService.listDownloadKeys()).map(async (id) => (await this.metadataService.getDownloadStatus(id))!)))
      .sort((a, b) => {
        if (a.queuePosition && b.queuePosition) {
          return a.queuePosition - b.queuePosition
        } else if (a.queuePosition) {
          return 1
        } else if (b.queuePosition) {
          return -1
        } else {
          return 0
        }
      });

    for (const r of resumable) {
      if (r.queuePosition) {
        this.queue.push(r)
      } else {
        this.resumeDownload(r)
      }
    }
  }

  async add(
    chatId: string | number,
    videoInfo: UIVideoInfo,
    ctxInfo: { chatName: string, msgDateSeconds: number, fileSize: number, extension: string },
    onStart: (id: string) => void
  ): Promise<string> {
    const job: DownloadJob = {
      chatId,
      videoInfo: videoInfo,
      ctxInfo,
      id: toBase64(randomUUID()).substring(0, 6),
      stopped: false,
      onStart,
      offset: bigInt(0),
    }

    const idx = this.queue.push(job);
    job.queuePosition = idx;

    // save the download status to the metadata service (for resuming)
    await this.metadataService.saveDownloadStatus(job.id, job).catch((e) => {
      console.log(e)
      this.ui.sendError(chatId, 'Error saving download status: ' + (e as any).message || 'Unknown error')
    });


    if (this.downloading.length < this.maxConcurrentDownloads) {
      this.downloadNext().catch((e) => {
        console.log(e)
        this.ui.sendError(chatId, 'Error downloading video: ' + (e as any).message || 'Unknown error')
      });
    }

    return job.id;
  }

  async stopDownload(id: string) {
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
      await this.metadataService.deleteDownloadStatus(id)
    }
  }

  getDownloadIds(): string[] {
    return [...this.queue, ...this.downloading].map((j) => j.id)
  }

  setConcurrency(ctx: Context, value: number) {
    this.maxConcurrentDownloads = value
    while (
      this.downloading.length < this.maxConcurrentDownloads &&
      this.queue.length > 0
    ) {
      this.downloadNext().catch((e) => {
        console.log(e)
        ctx.reply(
          'Error downloading video: ' + (e as any).message || 'Unknown error'
        )
      })
    }
  }

  async renameDownload(chatId: string | number, oldName: string, newName: string) {
    const job = this.queue.find((j) => j.videoInfo.fileName == oldName)
    if (job) {
      job.videoInfo.fileName = newName
      await this.metadataService.saveDownloadStatus(job.id, job)
      return true
    } else {
      await this.ui.sendError(chatId, 'Could not find video to rename')
      return false
    }
  }

  private async downloadNext() {
    if (this.queue.length == 0) {
      return
    }

    const job = this.queue.shift()!
    job.queuePosition = undefined

    // update the queue positions
    this.queue = this.queue.map((j) => {
      j.queuePosition = j.queuePosition! - 1
      return j
    });

    // save the new queue positions
    for (const j of this.queue) {
      await this.metadataService.saveDownloadStatus(j.id, j)
    }

    // save the started download status
    await this.metadataService.saveDownloadStatus(job.id, job)

    this.downloading.push(job)
    job.onStart?.(job.id)

    this.videoDownloader.startDownload(
      job,
      // on progress
      async (newJob) => {
        // update the job in the downloading array
        const idx = this.downloading.findIndex((j) => j.id == newJob.id)
        this.downloading[idx] = newJob;

        await this.metadataService.saveDownloadStatus(newJob.id, newJob)
        return this.ui.updateProgress(newJob.chatId, this.getProgressStatus())
      },
      // get stop status
      async () => {
        const stop = job.stopped
        if (stop) {
          this.downloading = this.downloading.filter((j) => j.id != job.id)
          await this.metadataService.deleteDownloadStatus(job.id)
          await this.ui.updateProgress(job.chatId, this.getProgressStatus())
        }

        return !!stop
      },
      // on complete
      async () => {
        this.downloading = this.downloading.filter((j) => j.id != job.id)
        await this.metadataService.deleteDownloadStatus(job.id)
        await this.ui.updateProgress(job.chatId, this.getProgressStatus())
        return this.downloadNext().catch((e) => {
          console.log(e)
          this.ui.sendError(job.chatId, 'Error downloading video: ' + (e as any).message || 'Unknown error')
        })
      }
    )
  }

  private async resumeDownload(job: DownloadJob) {
    this.downloading.push(job)
    this.videoDownloader.resumeDownload(
      job,
      // on progress
      async (newJob) => {
        // update the job in the downloading array
        const idx = this.downloading.findIndex((j) => j.id == newJob.id)
        this.downloading[idx] = newJob;

        await this.metadataService.saveDownloadStatus(newJob.id, newJob)
        return this.ui.updateProgress(newJob.chatId, this.getProgressStatus())
      },
      // get stop status
      async () => {
        const stop = job.stopped
        if (stop) {
          this.downloading = this.downloading.filter((j) => j.id != job.id)
          await this.metadataService.deleteDownloadStatus(job.id)
          await this.ui.updateProgress(job.chatId, this.getProgressStatus())
        }

        return !!stop
      },
      // on complete
      async () => {
        this.downloading = this.downloading.filter((j) => j.id != job.id)
        await this.metadataService.deleteDownloadStatus(job.id)
        await this.ui.updateProgress(job.chatId, this.getProgressStatus())
        return this.downloadNext().catch((e) => {
          console.log(e)
          this.ui.sendError(job.chatId, 'Error downloading video: ' + (e as any).message || 'Unknown error')
        })
      }
    )
  }

  private getProgressStatus(): UIProgressInfo | ProgressInfoMultiple | undefined {
    if (this.queue.length > 0 || this.downloading.length > 1) {
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
          return (
            job.progressInfo || {
              id: job.id,
              fileName: job.videoInfo.fileName,
              progressPercentage: 0,
              progress: prettyBytes(0),
              total: prettyBytes(0),
              speed: prettyBytes(0) + '/s',
              timeLeft: prettyMilliseconds(0),
              seriesName: job.videoInfo.seriesName,
            }
          )
        }),
      }
    } else if (this.downloading.length === 1) {
      return (
        this.downloading[0].progressInfo || {
          id: this.downloading[0].id,
          fileName: this.downloading[0].videoInfo.fileName,
          progressPercentage: 0,
          progress: prettyBytes(0),
          total: prettyBytes(0),
          speed: prettyBytes(0) + '/s',
          timeLeft: prettyMilliseconds(0),
          seriesName: this.downloading[0].videoInfo.seriesName,
        }
      )
    } else {
      return undefined
    }
  }
}
