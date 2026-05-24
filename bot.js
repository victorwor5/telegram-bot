require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// Start command
bot.start((ctx) => {
    ctx.reply(
        "Welcome 👋\nChoose a subscription plan:",
        Markup.inlineKeyboard([
            [Markup.button.callback("🎟 Tier 1", "tier1")],
            [Markup.button.callback("🔥 Tier 2", "tier2")]
        ])
    );
});

// Tier 1 button
bot.action("tier1", (ctx) => {
    ctx.reply("You selected Tier 1");
});

// Tier 2 button
bot.action("tier2", (ctx) => {
    ctx.reply("You selected Tier 2");
});

bot.launch();

console.log("Bot is running...");
