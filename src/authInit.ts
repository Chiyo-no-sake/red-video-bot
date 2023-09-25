import * as dotenv from 'dotenv';
import { ConfigParser } from './config/ConfigParser.js';
import TelegramService from './tg-client/TelegramService.js';

const main = async () => {
    dotenv.config();

    const configParser = new ConfigParser(process.env);

    const config = configParser.parseConfig();

    const {sessionString , ...auth} = config.auth;

    const telegram = new TelegramService({
        ...config,
        ...auth,
    });

    console.log("Starting with configuration:", config)
    console.log("Initializing session...")

    await telegram.start();
    console.log("Session initialized.")
};

main();
