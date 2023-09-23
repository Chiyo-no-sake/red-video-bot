export {};

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            BOT_TOKEN: string;
            TG_API_ID: string;
            TG_API_HASH: string;
            PHONE: string;
            VIDEO_DIR: string;
            CONFIG_DIR: string;
        }
    }
}