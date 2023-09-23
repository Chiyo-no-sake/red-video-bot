import { TelegramClient } from "telegram";
import { TelegramServiceConfig } from "./TelegramServiceConfig.js";
import { StoreSession } from "telegram/sessions/index.js";
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'process'
import { BigInteger } from "big-integer";
import { delay } from "../utils.js";
import { Chat } from "grammy/types";
import { EntityLike } from "telegram/define.js";

export default class TelegramService {
    client: TelegramClient;
    rl: any;
    session: StoreSession;

    constructor(config: TelegramServiceConfig) {
        this.session = new StoreSession(config.configDir + '/session');
        this.rl = createInterface({ input: stdin, output: stdout })

        this.client = new TelegramClient(
            this.session,
            config.apiId,
            config.apiHash,
            { connectionRetries: 5 }
        );
    }

    async initializeSession(phone?: string) {
        await this.client.start({
            phoneNumber: async () => phone || await this.rl.question('Insert phone number: '),
            phoneCode: async () => await this.rl.question('Insert received phone code: '),
            onError: (err) => console.log(err),
        })

        this.session.save()
    }

    async restoreSession(phone?: string) {
        await this.client.start({
            phoneCode: async () => {
                throw new Error("Session not found.");
            },
            phoneNumber: async () => {
                if (phone) return phone;
                throw new Error("Session not found.");
            },
            onError: (err) => console.log(err),
        })

        this.session.save()
    }


    async downloadMediaFromMessage(mediaData: { chatId?: string | EntityLike, msgId: number}, onDownloadProgress?: (progress: BigInteger, total: BigInteger) => void) {
        const msgId = mediaData.msgId
        const message = await this.client.getMessages(mediaData.chatId || "me", {
            ids: [msgId]
        })

        await delay(1000)

        if (message.length === 0) {
            throw new Error("Message not found.")
        }

        if ((!message[0]?.media as any)?.document) {
            throw new Error("Message is not a video.")
        }

        console.log("Downloading video...")
        return {
            fileName: (!message[0]?.media as any)?.document?.file_name || "video.mp4",
            mimeType: (!message[0]?.media as any)?.document?.mime_type || "mp4",
            buffer: await this.client.downloadMedia(message[0], {
            progressCallback: onDownloadProgress
        })}
    }
}