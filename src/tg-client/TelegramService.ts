import { Api, TelegramClient, utils } from 'telegram'
import { TelegramServiceConfig } from './TelegramServiceConfig.js'
import { StringSession } from 'telegram/sessions/index.js'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'process'
import { BigInteger } from 'big-integer'
import { delay } from '../utils.js'
import { EntityLike, OutFile, ProgressCallback } from 'telegram/define.js'
import {
  DownloadFileParamsV2,
  _downloadCachedPhotoSize,
  _downloadContact,
  _downloadPhoto,
  _downloadWebDocument,
  iterDownload,
} from 'telegram/client/downloads.js'
import {
  closeWriter,
  getProperFilename,
  getThumb,
  getWriter,
  returnWriterValue,
} from '../tgUtils.js'
import bigInt from 'big-integer'

export default class TelegramService {
  private client: TelegramClient
  private session: StringSession
  private rl: any
  private sessionString: string

  constructor(private readonly config: TelegramServiceConfig) {
    this.sessionString = config.sessionString!
    this.session = new StringSession(this.sessionString)
    this.rl = createInterface({ input: stdin, output: stdout })

    this.client = new TelegramClient(
      this.session,
      this.config.apiId,
      this.config.apiHash,
      { connectionRetries: 5 }
    )
  }

  async start() {
    await this.client.start({
      phoneNumber: async () =>
        this.config.phone || (await this.rl.question('Insert phone number: ')),
      phoneCode: async () =>
        await this.rl.question('Insert received phone code: '),
      onError: (err) => console.log(err),
    })

    this.sessionString = this.session.save()
    console.log(this.sessionString)
  }

  async downloadMediaFromMessage(
    mediaData: { chatName?: string; msgDateSeconds: number, fileSize: number },
    outputFile: string,
    progressCallback?: (progress: BigInteger, total: BigInteger) => void,
    stopDownload?: () => boolean | Promise<boolean>,
    offset: BigInteger = bigInt(0),
  ): Promise<[Api.Message, Promise<Buffer | string | undefined>]> {
    delay(500)
    const chatEntity = await this.client.getEntity(mediaData.chatName!)
    const messages = (await this.client?.getMessages(chatEntity, { limit: 30 })).filter(m => !!m.media)
    let message = messages.find(
      (msg) => {
        const sameDate = msg.date === mediaData.msgDateSeconds && !!msg.media

        return sameDate
      }
    )

    await delay(500)

    if (!message) {
      // throw new Error('Message not found. Maybe you deleted the message?')

      // instead of throwing an error, find the message, in the array of messages above, that is closest to the date provided
      message = messages.reduce((prev, curr) => {
        if (Math.abs(curr.date - mediaData.msgDateSeconds) < Math.abs(prev.date - mediaData.msgDateSeconds)) {
          return curr
        }
        return prev
      })
    }

    console.log('Downloading video...')
    return [message, this.stoppableDownloadMedia(
      this.client,
      message,
      outputFile,
      undefined,
      progressCallback,
      stopDownload,
      offset
    )]
  }

  // Adapted from the library to iterate the download so it can be stopped
  private async stoppableDownloadMedia(
    client: TelegramClient,
    messageOrMedia: Api.Message | Api.TypeMessageMedia,
    outputFile?: OutFile,
    thumb?: number | Api.TypePhotoSize,
    progressCallback?: ProgressCallback,
    stopDownload?: () => boolean | Promise<boolean>,
    offset: BigInteger = bigInt(0),
  ): Promise<Buffer | string | undefined> {
    /*
        Downloading large documents may be slow enough to require a new file reference
        to be obtained mid-download. Store (input chat, message id) so that the message
        can be re-fetched.
        */
    let msgData: [EntityLike, number] | undefined
    let date
    let media

    if (messageOrMedia instanceof Api.Message) {
      media = messageOrMedia.media
      date = messageOrMedia.date
      msgData = messageOrMedia.inputChat
        ? [messageOrMedia.inputChat, messageOrMedia.id]
        : undefined
    } else {
      media = messageOrMedia
      date = Date.now()
    }

    if (
      media instanceof Api.MessageMediaDocument ||
      media instanceof Api.Document
    ) {
      return this._downloadDocument(
        client,
        media,
        outputFile,
        date,
        thumb,
        progressCallback,
        msgData,
        stopDownload,
        offset
      )
    } else {
      throw new Error('This media is not a video. It cannot be downloaded.')
    }
  }

  /** Another function adapted from library to allow stopping downloads */
  private async _downloadDocument(
    client: TelegramClient,
    doc: Api.MessageMediaDocument | Api.TypeDocument,
    outputFile: OutFile | undefined,
    date: number,
    thumb?: number | string | Api.TypePhotoSize,
    progressCallback?: ProgressCallback,
    msgData?: [EntityLike, number],
    stopDownload?: () => boolean | Promise<boolean>,
    offset: BigInteger = bigInt(0)
  ): Promise<Buffer | string | undefined> {
    if (doc instanceof Api.MessageMediaDocument) {
      if (!doc.document) {
        return Buffer.alloc(0)
      }
      doc = doc.document
    }
    if (!(doc instanceof Api.Document)) {
      return Buffer.alloc(0)
    }
    let size
    if (thumb == undefined) {
      outputFile = await getProperFilename(
        outputFile,
        'document',
        '.' + (utils.getExtension(doc) || 'bin'),
        date
      )
    } else {
      outputFile = await getProperFilename(outputFile, 'photo', '.jpg', date)
      size = getThumb(doc.thumbs || [], thumb)
      if (
        size instanceof Api.PhotoCachedSize ||
        size instanceof Api.PhotoStrippedSize
      ) {
        return _downloadCachedPhotoSize(size, outputFile)
      }
    }

    return await this.stoppableDownloadFile(
      client,
      new Api.InputDocumentFileLocation({
        id: doc.id,
        accessHash: doc.accessHash,
        fileReference: doc.fileReference,
        thumbSize: size && 'type' in size ? size.type : '',
      }),
      {
        offset,
        msgData,
        outputFile,
        fileSize: size && 'size' in size ? bigInt(size.size) : doc.size,
        progressCallback: progressCallback,
      },
      stopDownload
    )
  }

  private async stoppableDownloadFile(
    client: TelegramClient,
    inputLocation: Api.TypeInputFileLocation,
    {
      outputFile = undefined,
      partSizeKb = undefined,
      fileSize = undefined,
      progressCallback = undefined,
      dcId = undefined,
      msgData = undefined,
      offset = bigInt.zero,
    }: DownloadFileParamsRedVideoV1,
    stopDownload?: () => boolean | Promise<boolean>
  ) {
    if (!partSizeKb) {
      if (!fileSize) {
        partSizeKb = 64
      } else {
        partSizeKb = utils.getAppropriatedPartSize(fileSize)
      }
    }

    const partSize = Math.floor(partSizeKb * 1024)
    if (partSize % 4096 != 0) {
      throw new Error('The part size must be evenly divisible by 4096')
    }

    const writer = getWriter(outputFile, offset.toJSNumber());

    let downloaded = offset;
    let startFrom = offset;
    try {
      for await (const chunk of iterDownload(client, {
        file: inputLocation,
        requestSize: partSize,
        dcId: dcId,
        msgData: msgData,
        offset: startFrom,
      })) {
        await writer.write(chunk)
        if (progressCallback) {
          await progressCallback(downloaded, bigInt(fileSize || bigInt.zero))
        }
        downloaded = downloaded.add(chunk.length)
        if (stopDownload && await stopDownload()) {
          break
        }
      }
      return returnWriterValue(writer)
    } finally {
      closeWriter(writer)
    }
  }
}

export type DownloadFileParamsRedVideoV1 = DownloadFileParamsV2 & { offset?: BigInteger }