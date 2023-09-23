import Mustache from 'mustache'

export interface VideoInfo {
  fileName: string
  fileSize: string
  duration: number
  fileId: string
}

export interface ProgressInfo {
  progressPercentage: number
  progress: string
  total: string
  speed: string
}

export interface Engine {
  renderVideoInfo(videoInfo: VideoInfo): string
  renderProgressInfo(progressInfo: ProgressInfo): string
}
