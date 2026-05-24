require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply("Hello 👋 Bot is working!");
});

bot.launch();

console.log("Bot is running...");
