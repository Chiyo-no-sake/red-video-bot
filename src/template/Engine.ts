export type UIVideoInfo = {
  fileName: string
  fileSize: string
  duration: string
  fileId: string
  isSeries?: boolean
  seriesName?: string
}

export type ModeInfo = {
  mode: 'Movie' | 'Series'
  seriesName?: string
  season?: number
}

export type UIProgressInfo = {
  fileName: string
  progressPercentage: number
  progress: string
  total: string
  speed: string
  timeLeft: string
  id: string
  seriesName: string | undefined
}

export type ProgressInfoMultiple = {
  queue: { fileName: string, total: string, seriesName: string | undefined, id: string }[],
  downloading: UIProgressInfo[],
}

export type OpenAIPromptInfo = {
  ctxJson: string
  seriesName: string | undefined
  videoType: 'movie' | 'series'
}

export interface Engine {
  renderCurrentMode(modeInfo: ModeInfo): string
  renderVideoInfo(videoInfo: UIVideoInfo): string
  renderProgressInfo(progressInfo: UIProgressInfo): string
  renderMultipleProgressInfo(progressInfo: ProgressInfoMultiple): string
  renderOpenAIPrompt(promptInfo: OpenAIPromptInfo): string
}
