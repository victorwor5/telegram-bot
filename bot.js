require("dotenv").config();

const http = require("http");
const axios = require("axios");
const { Markup, Telegraf } = require("telegraf");

const {
  BOT_TOKEN,
  TIER1_GROUP_ID,
  TIER2_GROUP_ID,
  FLW_PUBLIC_KEY,
  FLW_SECRET_KEY,
  FLW_HASH,
  PORT
} = process.env;

const requiredEnv = [
  "BOT_TOKEN",
  "TIER1_GROUP_ID",
  "TIER2_GROUP_ID",
  "FLW_PUBLIC_KEY",
  "FLW_SECRET_KEY",
  "FLW_HASH"
];

const missingEnv = requiredEnv.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variable(s): ${missingEnv.join(", ")}`);
}

const bot = new Telegraf(BOT_TOKEN);

const tiers = {
  tier1: {
    label: "Tier 1",
    amount: 5000,
    currency: "NGN",
    groupId: TIER1_GROUP_ID
  },
  tier2: {
    label: "Tier 2",
    amount: 10000,
    currency: "NGN",
    groupId: TIER2_GROUP_ID
  }
};

function getDisplayName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ")
    || user.username
    || `Telegram user ${user.id}`;
}

function buildTxRef(tierKey, userId) {
  return `${tierKey}_${userId}_${Date.now()}`;
}

function buildTierButtons() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Tier 1 - NGN 5,000", "subscribe:tier1")],
    [Markup.button.callback("Tier 2 - NGN 10,000", "subscribe:tier2")]
  ]);
}

async function createPaymentLink(tierKey, user) {
  const tier = tiers[tierKey];

  if (!tier) {
    throw new Error("Unknown subscription tier.");
  }

  const paymentData = {
    tx_ref: buildTxRef(tierKey, user.id),
    amount: tier.amount,
    currency: tier.currency,
    customer: {
      email: `telegram-user-${user.id}@example.com`,
      name: getDisplayName(user)
    },
    customizations: {
      title: `${tier.label} Telegram Subscription`,
      description: `Access to the ${tier.label} private Telegram group`
    },
    meta: {
      tier: tierKey,
      telegram_user_id: user.id,
      telegram_username: user.username || "",
      telegram_group_id: tier.groupId
    }
  };

  const response = await axios.post("https://api.flutterwave.com/v3/payments", paymentData, {
    headers: {
      Authorization: `Bearer ${FLW_SECRET_KEY}`,
      "Content-Type": "application/json"
    }
  });

  const paymentLink = response.data && response.data.data && response.data.data.link;

  if (!paymentLink) {
    throw new Error("Flutterwave did not return a payment link.");
  }

  return paymentLink;
}

bot.start((ctx) => {
  return ctx.reply("Choose a subscription plan:", buildTierButtons());
});

bot.command("subscribe", (ctx) => {
  return ctx.reply("Choose a subscription plan:", buildTierButtons());
});

bot.action(/^subscribe:(tier1|tier2)$/, async (ctx) => {
  const tierKey = ctx.match[1];
  const tier = tiers[tierKey];

  try {
    await ctx.answerCbQuery(`Preparing ${tier.label} payment link...`);

    const paymentLink = await createPaymentLink(tierKey, ctx.from);

    await ctx.reply(
      `Your ${tier.label} payment link is ready:`,
      Markup.inlineKeyboard([[Markup.button.url(`Pay for ${tier.label}`, paymentLink)]])
    );
  } } catch (error) {
    console.log("FULL ERROR:", error);
    console.log("FLW RESPONSE:", error.response?.data);
    await ctx.reply("Payment link creation failed. Check Railway logs.");
}
});

bot.catch((error, ctx) => {
  console.error(`Bot error for update ${ctx.update.update_id}:`, error);
});

bot.launch().then(() => {
  console.log("Bot running...");
});

if (PORT) {
  http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ok");
  }).listen(PORT, () => {
    console.log(`Health check listening on port ${PORT}.`);
  });
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
