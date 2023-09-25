import * as dotenv from 'dotenv';
import { ConfigParser } from './config/ConfigParser.js';
import TelegramService from './tg-client/TelegramService.js';

const main = async () => {
    dotenv.config();

    const configParser = new ConfigParser(process.env);

    const {sessionString: _, ...config} = configParser.parseConfig();
    

    const telegram = new TelegramService({
        ...config,
        ...config.auth,
    });

    console.log("Starting with configuration:", config)
    console.log("Initializing session...")

    await telegram.start();
    console.log("Session initialized.")
};

main();
