import { Engine, ProgressInfo, VideoInfo } from './engine.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { render } from 'ejs'

export default class EjsEngine implements Engine {
  private readonly progressTemplate: string
  private readonly videoTemplate: string

  constructor() {
    const p = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(p)
    const progressPath = path.join(__dirname, '../res/templates/mustache/progress.md')
    const videoPath = path.join(__dirname, '../res/templates/mustache/video.md')
    this.progressTemplate = readFileSync(
      progressPath,
      'utf-8'
    )
    this.videoTemplate = readFileSync(
      videoPath,
      'utf-8'
    )
  }

  renderVideoInfo(videoInfo: VideoInfo): string {
    return render(this.videoTemplate, videoInfo)
  }

  renderProgressInfo(progressInfo: ProgressInfo): string {
    return render(this.progressTemplate, progressInfo)
  }
}
