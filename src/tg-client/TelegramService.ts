import { Api, TelegramClient } from "telegram";
import { TelegramServiceConfig } from "./TelegramServiceConfig.js";
import { StringSession } from "telegram/sessions/index.js";
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'process'
import { BigInteger } from "big-integer";
import { delay } from "../utils.js";
import { EntityLike } from "telegram/define.js";


export default class TelegramService {
    private client: TelegramClient;
    private session: StringSession;
    private rl: any;
    private sessionString: string;

    constructor(private readonly config: TelegramServiceConfig) {
        this.sessionString = config.sessionString;
        this.session = new StringSession(this.sessionString);
        this.rl = createInterface({ input: stdin, output: stdout })

        this.client = new TelegramClient(
            this.session,
            this.config.apiId,
            this.config.apiHash,
            { connectionRetries: 5 }
        );
    }

    async start() {
        await this.client.start({
            phoneNumber: async () => this.config.phone || await this.rl.question('Insert phone number: '),
            phoneCode: async () => await this.rl.question('Insert received phone code: '),
            onError: (err) => console.log(err),
        })

        this.sessionString = this.session.save();
	console.log(this.sessionString);
    }

    async downloadMediaFromMessage(mediaData: { chatName?: string, msgDateSeconds: number}, outputFile: string, progressCallback?: (progress: BigInteger, total: BigInteger) => void) {
        const chatEntity = await this.client.getEntity(mediaData.chatName)
        const messages = await this.client?.getMessages(chatEntity)
        const message = messages.find((msg) => msg.date === mediaData.msgDateSeconds && !!msg.media)

        await delay(500)

        if (!message) {
            throw new Error("Message not found. Maybe you deleted the message?")
        } 

        if ((!message.media as any)?.document) {
            throw new Error("Message is not a video.")
        }

        console.log("Downloading video...")
        await this.client.downloadMedia(message, {
            progressCallback,
            outputFile
        })
    }
}
