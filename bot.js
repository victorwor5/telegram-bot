require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");
const express = require("express");

const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);

const TIERS = {
  tier1: {
    name: "Tier 1",
    amount: 7000,
    groupId: process.env.TIER1_GROUP_ID
  },

  tier2: {
    name: "Tier 2",
    amount: 20000,
    groupId: process.env.TIER2_GROUP_ID
  }
};

app.get("/", (req, res) => {
  res.send("Bot is running");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Health check listening on port ${PORT}.`);
});

async function createPaymentLink(userId, username, tierKey) {

  const tier = TIERS[tierKey];

  const paymentData = {
    tx_ref: `${tierKey}_${userId}_${Date.now()}`,

    amount: tier.amount,

    currency: "NGN",

    redirect_url: "https://google.com",

    customer: {
      email: `telegram-user-${userId}@example.com`,
      name: username || "Telegram User"
    },

    customizations: {
      title: `${tier.name} Telegram Subscription`,
      description: `Access to the ${tier.name} private Telegram group`
    },

    meta: {
      tier: tierKey,
      telegram_user_id: userId,
      telegram_username: username || "",
      telegram_group_id: tier.groupId
    }
  };

  try {

    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      paymentData,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.data.link;

  } catch (error) {

    console.log(
      "FLW RESPONSE:",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );

    return null;
  }
}

bot.start(async (ctx) => {

  await ctx.reply(
    "Choose a subscription tier:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎟 Tier 1 - ₦7,000", "tier1")
      ],
      [
        Markup.button.callback("🔥 Tier 2 - ₦20,000", "tier2")
      ]
    ])
  );

});

bot.action("tier1", async (ctx) => {

  const paymentLink = await createPaymentLink(
    ctx.from.id,
    ctx.from.username,
    "tier1"
  );

  if (paymentLink) {

    await ctx.reply(
      `Pay here:\n${paymentLink}`
    );

  } else {

    await ctx.reply(
      "Payment link creation failed. Check Railway logs."
    );

  }

});

bot.action("tier2", async (ctx) => {

  const paymentLink = await createPaymentLink(
    ctx.from.id,
    ctx.from.username,
    "tier2"
  );

  if (paymentLink) {

    await ctx.reply(
      `Pay here:\n${paymentLink}`
    );

  } else {

    await ctx.reply(
      "Payment link creation failed. Check Railway logs."
    );

  }

});

bot.launch();

console.log("Bot is running...");
