import { Engine, ModeInfo, ProgressInfo, ProgressInfoMultiple, VideoInfo } from "./template/Engine.js";
import { Context, InlineKeyboard } from "grammy";
import { delay } from "./utils.js";

export class UIService {
  private readonly updateDelay = 5000;

  private currentModeInfo?: ModeInfo;

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

  async newFoundVideo(ctx: Context, videoInfo: VideoInfo) {
    const infoText = this.templateEngine.renderVideoInfo(videoInfo)
    this.videoInfoMsgTxt = infoText

    await this._replyWithUpdates(ctx)
  }

  async updateMode(ctx: Context, modeInfo: Partial<{mode: 'Movie' | 'Series', seriesName?: string, season?: number}>) {
    const modeText = this.templateEngine.renderCurrentMode({...this.currentModeInfo!, ...modeInfo})
    this.modeMsgTxt = modeText

    await this._replyWithUpdates(ctx)
  }

  async updateProgress(ctx: Context, progressInfo: ProgressInfo | ProgressInfoMultiple | undefined) {
    if (!progressInfo) {
      this.progressMsgTxt = undefined
      await this._replyWithUpdates(ctx)
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

    await this._replyWithUpdates(ctx)
  }

  async sendSeriesPrompt(ctx: Context, series: string[]) {
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

    await ctx.reply(
      'Choose a series, or call again <code>/series NewName</code> to create and/or set a series',
      {
        reply_markup: inlineKeyboard,
        parse_mode: 'HTML',
      }
    ).then((msg) => {
      this.seriesPromptMessageId = msg.message_id
    })
  }

  async clearSeriesPrompt(ctx: Context) {
    if(!ctx.chat?.id) {
      throw new Error('Cannot clear message: No chat id')
    }

    if (this.seriesPromptMessageId) {
      await ctx.api.deleteMessage(ctx.chat?.id, this.seriesPromptMessageId)
        .catch(e => console.log('could not delete message: ', e))
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
      await ctx.api.editMessageText(ctx.chat?.id, this.messageId, text, {parse_mode: 'HTML'})
    }
    else if (this.messageId && this.recreate) {
      await ctx.api.deleteMessage(ctx.chat?.id, this.messageId)
        .catch(e => console.log('could not delete message: ', e))
      this.messageId = undefined
      await delay(1000)
      const msg = await ctx.reply(text, {parse_mode: 'HTML'})
      this.messageId = msg.message_id
    } else {
      await ctx.reply(text, {parse_mode: 'HTML'}).then((msg) => {
        this.messageId = msg.message_id
      })
    }

    this.recreate = false
    this.lastSentText = text
  }
}