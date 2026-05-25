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
    amount: 7000,
    currency: "NGN",
    groupId: TIER1_GROUP_ID
  },
  tier2: {
    label: "Tier 2",
    amount: 20000,
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
    [Markup.button.callback("Tier 1 - NGN 7,000", "subscribe:tier1")],
    [Markup.button.callback("Tier 2 - NGN 20,000", "subscribe:tier2")]
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

  redirect_url: "https://google.com",

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
    const paymentData = {
      tx_ref: `${tierKey}_${ctx.from.id}_${Date.now()}`,
      amount: tier.amount,
      currency: "NGN",
      redirect_url: "https://google.com",

      customer: {
        email: `telegram-user-${ctx.from.id}@example.com`,
        name: ctx.from.username || ctx.from.first_name || "Telegram User"
      },

      customizations: {
        title: `${tier.name} Telegram Subscription`,
        description: `Access to the ${tier.name} private Telegram group`
      },

      meta: {
        tier: tierKey,
        telegram_user_id: ctx.from.id,
        telegram_username: ctx.from.username || "",
        telegram_group_id: tier.groupId
      }
    };

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

    await ctx.reply(`Pay here:\n${response.data.data.link}`);

  } catch (error) {
    console.log(
      "FLW RESPONSE:",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );

    await ctx.reply("Payment link creation failed. Check Railway logs.");
  }
});

bot.catch((error, ctx) => {
  console.error(`Bot error for update ${ctx.update.update_id}:`, error);
});

bot.launch({
  dropPendingUpdates: true
})
  .then(() => {
    console.log("Bot running...");
  })
  .catch((error) => {
    console.error("Bot launch error:", error.message);
  });

if (PORT) {
  http.createServer((request, response) => {
    if (request.method === "POST" && request.url === "/flutterwave-webhook") {
      console.log("WEBHOOK HIT");
      let body = "";

      request.on("data", (chunk) => {
        body += chunk.toString();
      });

      request.on("end", async () => {
        try {
          const signature = request.headers["verif-hash"];

          if (!signature || signature !== FLW_HASH) {
            response.writeHead(401);
            return response.end("Unauthorized");
          }

          const event = JSON.parse(body);
          console.log("WEBHOOK BODY:", body);

          if (
            event.event === "charge.completed" &&
            event.data.status === "successful"
          ) {
            const telegramUserId = event.data.meta.telegram_user_id;
            const groupId = event.data.meta.telegram_group_id;

            const invite = await bot.telegram.createChatInviteLink(groupId, {
              member_limit: 1
            });

            await bot.telegram.sendMessage(
              telegramUserId,
              `✅ Payment confirmed!\nJoin your group here:\n${invite.invite_link}`
            );
          }

          response.writeHead(200);
          response.end("OK");
        } catch (error) {
          console.log("Webhook error:", error);
          response.writeHead(500);
          response.end("Webhook error");
        }
      });

      return;
    }

    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ok");
  }).listen(PORT, () => {
    console.log(`Health check listening on port ${PORT}.`);
  });
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
