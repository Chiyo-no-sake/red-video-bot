export interface RedVideoBotConfig {
    auth: {
        botToken: string;
        apiHash: string;
        apiId: number;
        sessionString: string;
    },
    videoDir: string;
    configDir: string;
    phone: string;
}