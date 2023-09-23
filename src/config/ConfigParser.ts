import { RedVideoBotConfig } from "./Config.js";

export class ConfigParser {
    constructor(private readonly env: typeof process.env) {}

    public parseConfig(): RedVideoBotConfig {
        return {
            auth: {
                botToken: this.env.BOT_TOKEN,
                apiHash: this.env.TG_API_HASH,
                apiId: Number(this.env.TG_API_ID),
            },
            videoDir: this.env.VIDEO_DIR,
            configDir: this.env.CONFIG_DIR,
            phone: this.env.PHONE,
        }
    }
}