import { TelegramClient } from "telegram";
import { TelegramServiceConfig } from "./TelegramServiceConfig.js";
import { StringSession } from "telegram/sessions/index.js";
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'process'
import { BigInteger } from "big-integer";
import { delay } from "../utils.js";
import { EntityLike } from "telegram/define.js";
import { readFileSync, writeFileSync  } from "fs";
import path from "path";

export default class TelegramService {
    private client: TelegramClient | undefined;
    rl: any;
    private session: StringSession| undefined;

    constructor(private readonly config: TelegramServiceConfig) {
    }

    async initializeSession(phone?: string) {
        this.session = new StringSession();
        this.rl = createInterface({ input: stdin, output: stdout })

        this.client = new TelegramClient(
            this.session,
            this.config.apiId,
            this.config.apiHash,
            { connectionRetries: 5 }
        );

        await this.client.start({
            phoneNumber: async () => phone || await this.rl.question('Insert phone number: '),
            phoneCode: async () => await this.rl.question('Insert received phone code: '),
            onError: (err) => console.log(err),
        })

        const str = this.session.save()
        
        // write string to file
        const targetPath = path.join(this.config.configDir, "session.txt")
        writeFileSync(targetPath, str)
    }

    async restoreSession(phone?: string) {
        const targetPath = path.join(this.config.configDir, "session.txt")
        const str = readFileSync(targetPath, 'utf-8')

        this.session = new StringSession(str);
        this.rl = createInterface({ input: stdin, output: stdout })

        this.client = new TelegramClient(
            this.session,
            this.config.apiId,
            this.config.apiHash,
            { connectionRetries: 5 }
        );

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

        console.log("Session restored.")
        const sstr = this.session.save()

        // write string to file
        writeFileSync(targetPath, sstr)
    }


    async downloadMediaFromMessage(mediaData: { chatId?: string | EntityLike, msgId: number}, onDownloadProgress?: (progress: BigInteger, total: BigInteger) => void) {
        const msgId = mediaData.msgId
        const message = await this.client?.getMessages(mediaData.chatId || "me", {
            ids: [msgId]
        })

        await delay(1000)

        if (!message || message?.length === 0) {
            throw new Error("Message not found.")
        }

        if ((!message[0].media as any)?.document) {
            throw new Error("Message is not a video.")
        }

        console.log("Downloading video...")
        return {
            fileName: (!message[0]?.media as any)?.document?.file_name || "video.mp4",
            mimeType: (!message[0]?.media as any)?.document?.mime_type || "mp4",
            buffer: await this.client?.downloadMedia(message[0], {
            progressCallback: onDownloadProgress
        })}
    }
}