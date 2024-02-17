import { readFileSync } from 'fs'
import { Engine, ModeInfo, OpenAIPromptInfo, UIProgressInfo, ProgressInfoMultiple, UIVideoInfo } from './Engine.js'
import { fileURLToPath } from 'url'
import path from 'path'
import { render } from 'ejs'

export default class EjsEngine implements Engine {
  private readonly modeTemplate: string
  private readonly progressTemplate: string
  private readonly progressMultipleTemplate: string
  private readonly videoTemplate: string
  private readonly openAIPromptTemplate: string

  constructor() {
    const p = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(p)
    const templatesDir = path.join(__dirname, '../res/templates/mustache')
    const modePath = path.join(templatesDir, 'mode.ejs')
    const progressPath = path.join(templatesDir, 'progress_single.ejs')
    const progressMultiPath = path.join(templatesDir, 'progress_multi.ejs')
    const videoPath = path.join(templatesDir, 'video.ejs')
    const openAIPromptPath = path.join(templatesDir, 'openai_user_prompt.ejs')

    this.modeTemplate = readFileSync(
      modePath,
      'utf-8'
    )

    this.progressTemplate = readFileSync(
      progressPath,
      'utf-8'
    )

    this.progressMultipleTemplate = readFileSync(
      progressMultiPath,
      'utf-8'
    )

    this.videoTemplate = readFileSync(
      videoPath,
      'utf-8'
    )
    this.openAIPromptTemplate = readFileSync(
      openAIPromptPath,
      'utf-8'
    )
  }

  renderCurrentMode(modeInfo: ModeInfo): string {
    // transform the modeInfo into an object that has all fields and missing fields are undefined
    const modeInfoObj = {
      mode: modeInfo.mode,
      seriesName: modeInfo.seriesName,
      season: modeInfo.season,
    }

    return render(this.modeTemplate, modeInfoObj)
  }

  renderVideoInfo(videoInfo: UIVideoInfo): string {
    const videoInfoObj = {
      fileName: videoInfo.fileName,
      fileSize: videoInfo.fileSize,
      duration: videoInfo.duration,
      isSeries: videoInfo.isSeries,
      seriesName: videoInfo.seriesName,
      fileId: videoInfo.fileId,
    }

    return render(this.videoTemplate, videoInfoObj)
  }

  renderProgressInfo(progressInfo: UIProgressInfo): string {
    const progressInfoObj = {
      fileName: progressInfo.fileName,
      progressPercentage: progressInfo.progressPercentage,
      progress: progressInfo.progress,
      total: progressInfo.total,
      speed: progressInfo.speed,
      timeLeft: progressInfo.timeLeft,
      seriesName: progressInfo.seriesName,
      id: progressInfo.id,
    }

    return render(this.progressTemplate, progressInfoObj)
  }

  renderMultipleProgressInfo(progressInfo: ProgressInfoMultiple): string {
    const progressInfoObj = {
      queue: progressInfo.queue.map((job) => {
        return {
          fileName: job.fileName,
          total: job.total,
          seriesName: job.seriesName,
          id: job.id,
        }
      }),
      downloading: progressInfo.downloading.map((job) => {
        return {
          fileName: job.fileName,
          progressPercentage: job.progressPercentage,
          progress: job.progress,
          total: job.total,
          speed: job.speed,
          timeLeft: job.timeLeft,
          seriesName: job.seriesName,
          id: job.id,
        }
      }),
    }

    return render(this.progressMultipleTemplate, progressInfoObj)
  }

  renderOpenAIPrompt(promptInfo: OpenAIPromptInfo): string {
    const promptInfoObj = {
      ctxJson: promptInfo.ctxJson,
      seriesName: promptInfo.seriesName,
      videoType: promptInfo.videoType,
    }

    return render(this.openAIPromptTemplate, promptInfoObj)
  }
}
