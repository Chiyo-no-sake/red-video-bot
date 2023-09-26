export interface RedVideoBotConfig {
    auth: {
        botToken: string;
        apiHash: string;
        apiId: number;
        sessionString: string;
    },
    openai: {
        apiKey: string;
        engine: 'gpt-3.5-turbo' | 'gpt-4';
    },
    videoDir: string;
    configDir: string;
    phone: string;
}