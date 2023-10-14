import { readFileSync } from 'fs'
import { Engine, ModeInfo, OpenAIPromptInfo, ProgressInfo, ProgressInfoMultiple, VideoInfo } from './Engine.js'
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
    return render(this.modeTemplate, modeInfo)
  }

  renderVideoInfo(videoInfo: VideoInfo): string {
    return render(this.videoTemplate, videoInfo)
  }

  renderProgressInfo(progressInfo: ProgressInfo): string {
    return render(this.progressTemplate, progressInfo)
  }

  renderMultipleProgressInfo(progressInfo: ProgressInfoMultiple): string {
    return render(this.progressMultipleTemplate, progressInfo)
  }

  renderOpenAIPrompt(promptInfo: OpenAIPromptInfo): string {
    return render(this.openAIPromptTemplate, promptInfo)
  }
}
