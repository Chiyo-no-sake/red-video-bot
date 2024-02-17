import fs from 'fs'
import TelegramService from '../tg-client/TelegramService.js'
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'
import bigInt, { BigInteger } from 'big-integer'
import { DownloadJob } from './DownloadMetadataService.js'

export type VideoDownloaderConfig = {
  videoDir: string
}

export class VideoDownloader {
  constructor(
    private readonly config: VideoDownloaderConfig,
    private readonly tg: TelegramService,
  ) { }

  startDownload(
    job: DownloadJob,
    progressCallback: (job: DownloadJob) => void,
    stopDownload: () => Promise<boolean> | boolean,
    onComplete: () => void,
  ) {
    return this.download(
      job,
      progressCallback,
      onComplete,
      stopDownload
    )
  }

  resumeDownload(
    job: DownloadJob,
    progressCallback: (job: DownloadJob) => void,
    stopDownload: () => Promise<boolean> | boolean,
    onComplete: () => void
  ) {
    return this.resume(
      job,
      progressCallback,
      stopDownload,
      onComplete
    )
  }

  private async resume(
    job: DownloadJob,
    progressCallback: (job: DownloadJob) => void,
    stopDownload: () => Promise<boolean> | boolean,
    onComplete: () => void
  ) {
    const startTime = Date.now()
    let startOffset = job.offset

    this.progressCallback(
      job,
      startTime,
      job.offset,
      bigInt.zero,
      bigInt(job.ctxInfo.fileSize),
      job.videoInfo.fileName,
      job.videoInfo.seriesName,
      progressCallback
    )

    const [message, dlPromise] = await this.tg.downloadMediaFromMessage({
      chatName: job.ctxInfo.chatName,
      msgDateSeconds: job.ctxInfo.msgDateSeconds,
      fileSize: job.ctxInfo.fileSize,
    },
      job.filePath!,
      async (progress, total) => {
        // the progress made only in this try (from when the download resumed)
        // is equal to the current progress minus the offset when the download resumed
        job.offset = progress;
        const currentProgress = progress.minus(startOffset);
        return await this.progressCallback(
          job,
          startTime,
          progress,
          currentProgress,
          total,
          job.videoInfo.fileName,
          job.videoInfo.seriesName,
          progressCallback
        );
      },
      // stop callback, to check if the download should be stopped and delete the metadata
      async () => {
        return await stopDownload()
      },
      job.offset
    );

    // wait for the download to finish
    await dlPromise;

    // Update the progress to 100% and the speed to 0
    job.offset = bigInt(job.ctxInfo.fileSize);
    await this.progressCallback(
      job,
      startTime,
      bigInt(job.ctxInfo.fileSize),
      bigInt(job.ctxInfo.fileSize),
      bigInt(job.ctxInfo.fileSize),
      job.videoInfo.fileName,
      job.videoInfo.seriesName,
      progressCallback
    );

    onComplete();
  }

  // blocking
  private async download(
    job: DownloadJob,
    progressCallback: (job: DownloadJob) => void,
    onComplete: () => void,
    stopDownload: () => Promise<boolean> | boolean,
  ) {
    const start = Date.now()
    const finalName = `${job.videoInfo.fileName}.${job.ctxInfo.extension}`
    const finalPath =
      this.config.videoDir +
      '/' +
      (job.videoInfo.isSeries ? 'tv/' + job.videoInfo.seriesName + '/' : 'movies/') +
      finalName

    job.filePath = finalPath;

    // Create all necessary directories, if they don't exist
    const dir = finalPath.split('/')
    dir.pop()
    const dirPath = dir.join('/')
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }

    await this.progressCallback(
      job,
      start,
      bigInt.zero,
      bigInt.zero,
      bigInt(job.ctxInfo.fileSize),
      finalName,
      job.videoInfo.seriesName,
      progressCallback
    )

    // Start the download, and get the message and the promise to download the file
    const [message, dlPromise] = await this.tg.downloadMediaFromMessage(
      {
        chatName: job.ctxInfo.chatName,
        msgDateSeconds: job.ctxInfo.msgDateSeconds,
        fileSize: job.ctxInfo.fileSize,
      },
      finalPath,
      async (progress, total) => {
        job.offset = progress;

        return await this.progressCallback(
          job,
          start,
          progress,
          progress,
          total,
          finalName,
          job.videoInfo.seriesName,
          progressCallback
        );
      },
      // stop callback, to check if the download should be stopped
      async () => {
        return await stopDownload()
      }
    )

    await dlPromise;

    // Update the progress to 100% and the speed to 0
    job.offset = bigInt(job.ctxInfo.fileSize);
    await this.progressCallback(
      job,
      start,
      bigInt(job.ctxInfo.fileSize),
      bigInt(job.ctxInfo.fileSize),
      bigInt(job.ctxInfo.fileSize),
      finalName,
      job.videoInfo.seriesName,
      progressCallback
    );

    onComplete();
  }

  /**
   * 
   * @param job The download job
   * @param start The time when the download started, or resumed
   * @param totalProgress The total progress of the download
   * @param currentTryProgress The progress of the download made since it has resumed
   * @param total The total size of the file
   * @param finalName the name of the file
   * @param seriesName the name of the series, if the file is part of a series
   * @param progressCallback callback to update the progress to clients
   */
  private async progressCallback(job: DownloadJob, start: number, totalProgress: BigInteger, currentTryProgress: BigInteger, total: BigInteger, finalName: string, seriesName: string | undefined, progressCallback: (job: DownloadJob) => void,) {
    const elapsedSeconds = (Date.now() - start) / 1000;

    const remaining = total.subtract(totalProgress);

    const progressPercentage = totalProgress
      .multiply(100)
      .divide(total)
      .toJSNumber()

    const speed = prettyBytes(
      elapsedSeconds === 0
        ? 0
        : (currentTryProgress.toJSNumber() / elapsedSeconds)
    ) + '/s';

    const remainingMs = elapsedSeconds === 0 ? Infinity : remaining.toJSNumber() / (currentTryProgress.toJSNumber() / elapsedSeconds) * 1000;

    const remainingSeconds =
      remainingMs === Infinity
        ? '∞'
        : prettyMilliseconds(remainingMs, { secondsDecimalDigits: 0 })

    job.progressInfo = {
      fileName: finalName,
      progressPercentage,
      progress: prettyBytes(totalProgress.toJSNumber()),
      total: prettyBytes(total.toJSNumber()),
      speed,
      timeLeft: remainingSeconds,
      seriesName,
      id: job.id,
    }

    return progressCallback(job)
  }
}
