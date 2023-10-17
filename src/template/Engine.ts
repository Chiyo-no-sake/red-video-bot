export type VideoInfo = {
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
}

export type ProgressInfo = {
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
  queue: {fileName: string, total: string, seriesName: string | undefined, id: string}[],
  downloading: ProgressInfo[],
}

export type OpenAIPromptInfo = {
  ctxJson: string
  seriesName: string | undefined
  videoType: 'movie' | 'series'
}

export interface Engine {
  renderCurrentMode(modeInfo: ModeInfo): string
  renderVideoInfo(videoInfo: VideoInfo): string
  renderProgressInfo(progressInfo: ProgressInfo): string
  renderMultipleProgressInfo(progressInfo: ProgressInfoMultiple): string
  renderOpenAIPrompt(promptInfo: OpenAIPromptInfo): string
}
