export interface RedVideoBotConfig {
    auth: {
        botToken: string;
        apiHash: string;
        apiId: number;
    },
    videoDir: string;
    configDir: string;
    phone?: string;
}