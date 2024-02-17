import { Engine, ModeInfo, UIProgressInfo, ProgressInfoMultiple, UIVideoInfo } from "./template/Engine.js";
import { Context, InlineKeyboard, Bot } from "grammy";
import { delay } from "./utils.js";

export class UIService {
  private readonly updateDelay = 5000;

  private currentModeInfo?: ModeInfo = {
    mode: 'Movie',
    seriesName: undefined,
    season: undefined,
  }

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
    private readonly bot: Bot
  ) {
    this.modeMsgTxt = this.templateEngine.renderCurrentMode({ mode: 'Movie', seriesName: undefined })
  }

  async newFoundVideo(chatId: string | number, videoInfo: UIVideoInfo) {
    const infoText = this.templateEngine.renderVideoInfo(videoInfo)
    this.videoInfoMsgTxt = infoText

    await this._replyWithUpdates(chatId)
  }

  async updateMode(chatId: string | number, modeInfo: { mode: 'Movie' | 'Series', seriesName?: string, season?: number }) {
    const modeText = this.templateEngine.renderCurrentMode({ ...this.currentModeInfo!, ...modeInfo })
    this.modeMsgTxt = modeText

    await this._replyWithUpdates(chatId)
  }

  async updateProgress(chatId: string | number, progressInfo: UIProgressInfo | ProgressInfoMultiple | undefined) {
    if (!progressInfo) {
      this.progressMsgTxt = undefined
      await this._replyWithUpdates(chatId)
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

    await this._replyWithUpdates(chatId)
  }

  async sendSeriesPrompt(chatId: number | string, series: string[]) {
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

    await this.bot.api.sendMessage(
      chatId,
      'Choose a series, or call again <code>/series NewName</code> to create and/or set a series',
      {
        reply_markup: inlineKeyboard,
        parse_mode: 'HTML',
      }
    ).then((msg) => {
      this.seriesPromptMessageId = msg.message_id
    })
  }

  async clearSeriesPrompt(chatId: string | number | undefined) {
    if (!chatId) {
      throw new Error('Cannot clear message: No chat id')
    }

    if (this.seriesPromptMessageId) {
      await this.bot.api.deleteMessage(chatId, this.seriesPromptMessageId)
        .catch(e => console.log('could not delete message: ', e))
      this.seriesPromptMessageId = undefined
    }
  }

  async sendError(chatId: string | number, error: string) {
    await this.bot.api.sendMessage(chatId, error)
  }

  private async _replyWithUpdates(chatId: string | number | undefined) {
    if (!chatId) {
      throw new Error('Cannot update message: No chat id')
    }

    let text = this.modeMsgTxt
    text += this.videoInfoMsgTxt ? '\n\n' + this.videoInfoMsgTxt : ''
    text += this.progressMsgTxt ? '\n\n' + this.progressMsgTxt : ''

    if (text === this.lastSentText) {
      return
    }

    if (this.messageId && !this.recreate) {
      await this.bot.api.editMessageText(chatId, this.messageId, text, { parse_mode: 'HTML' })
    }
    else if (this.messageId && this.recreate) {
      await this.bot.api.deleteMessage(chatId, this.messageId)
        .catch(e => console.log('could not delete message: ', e))

      this.messageId = undefined
      await delay(1000)
      const msg = await this.bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' })
      this.messageId = msg.message_id
    } else {
      await this.bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' }).then((msg) => {
        this.messageId = msg.message_id
      })
    }

    this.recreate = false
    this.lastSentText = text
  }
}
