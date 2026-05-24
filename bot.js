require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// START
bot.start((ctx) => {
    ctx.reply(
        "Choose a subscription plan:",
        Markup.inlineKeyboard([
            [Markup.button.callback("🎟 Tier 1 - ₦5,000", "tier1")],
            [Markup.button.callback("🔥 Tier 2 - ₦10,000", "tier2")]
        ])
    );
});

// TIER 1
bot.action("tier1", async (ctx) => {

    const paymentData = {
        tx_ref: "tier1_" + Date.now(),
        amount: 5000,
        currency: "NGN",
        redirect_url: "https://example.com",
        customer: {
            email: "test@email.com",
            name: ctx.from.first_name
        },
        customizations: {
            title: "Tier 1 Subscription"
        }
    };

    try {

        const response = await axios.post(
            "https://api.flutterwave.com/v3/payments",
            paymentData,
            {
                headers: {
                    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`
                }
            }
        );

        const paymentLink = response.data.data.link;

        ctx.reply(`Pay here:\n${paymentLink}`);

    } catch (error) {
        console.log(error.response?.data || error.message);
        ctx.reply("Payment link creation failed");
    }

});

// TIER 2
bot.action("tier2", async (ctx) => {

    const paymentData = {
        tx_ref: "tier2_" + Date.now(),
        amount: 10000,
        currency: "NGN",
        redirect_url: "https://example.com",
        customer: {
            email: "test@email.com",
            name: ctx.from.first_name
        },
        customizations: {
            title: "Tier 2 Subscription"
        }
    };

    try {

        const response = await axios.post(
            "https://api.flutterwave.com/v3/payments",
            paymentData,
            {
                headers: {
                    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`
                }
            }
        );

        const paymentLink = response.data.data.link;

        ctx.reply(`Pay here:\n${paymentLink}`);

    } catch (error) {
        console.log(error.response?.data || error.message);
        ctx.reply("Payment link creation failed");
    }

});

bot.launch();

console.log("Bot running...");
