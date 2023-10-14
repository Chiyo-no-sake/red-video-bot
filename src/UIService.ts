import { Engine, ProgressInfo, ProgressInfoMultiple, VideoInfo } from "./template/Engine.js";
import { Context, InlineKeyboard } from "grammy";

export class UIService {
  private readonly updateDelay = 3000;

  private modeMsgTxt: string
  private videoInfoMsgTxt?: string
  private progressMsgTxt?: string

  private messageId?: number;
  private seriesPromptMessageId?: number;

  private lastUpdate?: number = undefined
  private lastSentText?: string = undefined

  recreate: boolean = false

  constructor(
    private readonly templateEngine: Engine,
  ) {
    this.modeMsgTxt = this.templateEngine.renderCurrentMode({mode: 'Movie', seriesName: undefined})
  }

  newFoundVideo(ctx: Context, videoInfo: VideoInfo) {
    const infoText = this.templateEngine.renderVideoInfo(videoInfo)
    this.videoInfoMsgTxt = infoText

    this._replyWithUpdates(ctx)
  }

  updateMode(ctx: Context, modeInfo: {mode: 'Movie' | 'Series', seriesName?: string}) {
    const modeText = this.templateEngine.renderCurrentMode(modeInfo)
    this.modeMsgTxt = modeText

    this._replyWithUpdates(ctx)
  }

  updateProgress(ctx: Context, progressInfo: ProgressInfo | ProgressInfoMultiple | undefined) {
    if (!progressInfo) {
      this.progressMsgTxt = undefined
      this._replyWithUpdates(ctx)
      return
    }

    // Only update existing every 3 seconds
    if (this.lastUpdate !== undefined && Date.now() - this.lastUpdate < this.updateDelay) {
      return
    }

    this.lastUpdate = Date.now()

    if ('queue' in progressInfo) {
      this.progressMsgTxt = this.templateEngine.renderMultipleProgressInfo(progressInfo)
    } else {
      this.progressMsgTxt = this.templateEngine.renderProgressInfo(progressInfo)
    }

    this._replyWithUpdates(ctx)
  }

  sendSeriesPrompt(ctx: Context, series: string[]) {
    const buttons = series.map((seriesName) => {
      return {
        text: seriesName,
        callback_data: seriesName,
      }
    })

    const inlineKeyboard = new InlineKeyboard()
  
    for (const button of buttons) {
      inlineKeyboard
        .text(button.text, button.callback_data)
        .row()
    }

    ctx.reply(
      'Choose a series, or call again <code>/series NewName</code> to create and/or set a series',
      {
        reply_markup: inlineKeyboard,
        parse_mode: 'HTML',
      }
    ).then((msg) => {
      this.seriesPromptMessageId = msg.message_id
    })
  }

  clearSeriesPrompt(ctx: Context) {
    if(!ctx.chat?.id) {
      throw new Error('Cannot clear message: No chat id')
    }

    if (this.seriesPromptMessageId) {
      ctx.api.deleteMessage(ctx.chat?.id, this.seriesPromptMessageId)
      this.seriesPromptMessageId = undefined
    }
  }

  private async _replyWithUpdates(ctx: Context) {
    if(!ctx.chat?.id) {
      throw new Error('Cannot update message: No chat id')
    }
  
    let text = this.modeMsgTxt
    text += this.videoInfoMsgTxt ? '\n\n' + this.videoInfoMsgTxt : ''
    text += this.progressMsgTxt ? '\n\n' + this.progressMsgTxt : ''

    if(text === this.lastSentText) {
      return
    }

    if (this.messageId && !this.recreate) {
      ctx.api.editMessageText(ctx.chat?.id, this.messageId, text, {parse_mode: 'HTML'})
    }
    else if (this.messageId && this.recreate) {
      ctx.api.deleteMessage(ctx.chat?.id, this.messageId)
      this.messageId = undefined
      ctx.reply(text, {parse_mode: 'HTML'}).then((msg) => {
        this.messageId = msg.message_id
      })

      this.recreate = false
    } else {
      ctx.reply(text, {parse_mode: 'HTML'}).then((msg) => {
        this.messageId = msg.message_id
      })
    }

    this.lastSentText = text
  }
}