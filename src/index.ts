import * as dotenv from 'dotenv';
import { ConfigParser } from './config/ConfigParser.js';
import TelegramService from './tg-client/TelegramService.js';
import { startBot } from './bot/Bot.js';

const main = async () => {
    dotenv.config();

    const configParser = new ConfigParser(process.env);
    const config = configParser.parseConfig();
    
    console.log("Starting with config:", config)
    const telegram = new TelegramService({
        ...config,
        ...config.auth,
    });


    await telegram.start();
    console.log("Session restored.")

    await startBot(config, telegram)
    console.log("Bot started.")
}


main();