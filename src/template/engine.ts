export type VideoInfo = {
  fileName: string
  fileSize: string
  duration: string
  fileId: string
  isSeries?: boolean
  seriesName?: string
}

export type ProgressInfo = {
  progressPercentage: number
  progress: string
  total: string
  speed: string
  timeLeft: string
}

export type OpenAIPromptInfo = {
  ctxJson: string
  seriesNames: string
}

export interface Engine {
  renderVideoInfo(videoInfo: VideoInfo): string
  renderProgressInfo(progressInfo: ProgressInfo): string
  renderOpenAIPrompt(promptInfo: OpenAIPromptInfo): string
}
