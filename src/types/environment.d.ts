export {};

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            BOT_TOKEN: string;
            TG_API_ID: string;
            TG_API_HASH: string;
            SESSION_STRING: string;
            OPENAI_API_KEY: string;
            OPENAI_ENGINE: 'gpt-3.5-turbo' | 'gpt-4';
            PHONE: string;
            VIDEO_DIR: string;
            CONFIG_DIR: string;
        }
    }
}