require("dotenv").config();

const http = require("http");
const axios = require("axios");
const { Markup, Telegraf } = require("telegraf");
const { Pool } = require("pg");

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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
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

  const event = JSON.parse(body);

  console.log("WEBHOOK BODY:", body);

  if (event.status === "successful") {

    const txParts = event.txRef.split("_");

    const tierKey = txParts[0];
    const telegramUserId = txParts[1];

    const tier = tiers[tierKey];
    const groupId = tier.groupId;

    const invite = await bot.telegram.createChatInviteLink(groupId, {
      member_limit: 1
    });
const expiresAt = new Date();

expiresAt.setMonth(expiresAt.getMonth() + 1);

const existingSub = await pool.query(
  `
    SELECT *
    FROM subscriptions
    WHERE telegram_user_id = $1
      AND tier = $2
    ORDER BY expires_at DESC
    LIMIT 1
  `,
  [telegramUserId, tierKey]
);

let newExpiresAt = new Date();

if (existingSub.rows.length > 0 && new Date(existingSub.rows[0].expires_at) > new Date()) {
  newExpiresAt = new Date(existingSub.rows[0].expires_at);
}

newExpiresAt.setMonth(newExpiresAt.getMonth() + 1);

if (existingSub.rows.length > 0) {
  await pool.query(
    `
      UPDATE subscriptions
      SET
        expires_at = $1,
        group_id = $2,
        reminded_before_expiry = false,
        grace_warning_sent = false,
        removed = false
      WHERE id = $3
    `,
    [newExpiresAt, groupId, existingSub.rows[0].id]
  );
} else {
  await pool.query(
    `
      INSERT INTO subscriptions
      (telegram_user_id, tier, expires_at, group_id)
      VALUES ($1, $2, $3, $4)
    `,
    [telegramUserId, tierKey, newExpiresAt, groupId]
  );
} 
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
setInterval(async () => {

  console.log("Checking subscriptions...");

  const result = await pool.query(`
    SELECT *
    FROM subscriptions
    WHERE
      expires_at <= NOW() + INTERVAL '3 days'
      AND reminded_before_expiry = false
  `);

  console.log("Subscriptions needing reminder:", result.rows.length);
  for (const sub of result.rows) {
  await bot.telegram.sendMessage(
    sub.telegram_user_id,
    `😂 Omo... your subscription is packing its bags already.

In 3 days, your access expires and the bot bouncers may escort you out dramatically. 🚪

Renew before then to keep enjoying the community. 🎤🔥`
  );

  await pool.query(
    `
      UPDATE subscriptions
      SET reminded_before_expiry = true
      WHERE id = $1
    `,
    [sub.id]
  );
}
const graceResult = await pool.query(`
  SELECT *
  FROM subscriptions
  WHERE
    expires_at <= NOW()
    AND grace_warning_sent = false
    AND removed = false
`);
console.log("Expired users needing grace warning:", graceResult.rows.length);
  for (const sub of graceResult.rows) {
  await bot.telegram.sendMessage(
    sub.telegram_user_id,
    `😭 Ah ah… your subscription has expired o.

Right now the bot bouncers are stretching before escorting people out dramatically. 🚪😂

You still have a small grace period to renew before access disappears. 🎤🔥`
  );

  await pool.query(
    `
      UPDATE subscriptions
      SET grace_warning_sent = true
      WHERE id = $1
    `,
    [sub.id]
  );
}
  const removalResult = await pool.query(`
  SELECT *
  FROM subscriptions
  WHERE
    expires_at <= NOW() - INTERVAL '3 days'
    AND grace_warning_sent = true
    AND removed = false
`);

console.log("Users needing removal:", removalResult.rows.length);

for (const sub of removalResult.rows) {
  try {
    await bot.telegram.banChatMember(
      sub.group_id,
      sub.telegram_user_id
    );

    await bot.telegram.unbanChatMember(
      sub.group_id,
      sub.telegram_user_id
    );

    await bot.telegram.sendMessage(
      sub.telegram_user_id,
      `💔 The bot bouncers have completed their assignment 😭

Your access has now been removed because the grace period ended.

But no hard feelings 😂
You can always renew and come back stronger. 🎤🔥`
    );

    await pool.query(
      `
        UPDATE subscriptions
        SET removed = true
        WHERE id = $1
      `,
      [sub.id]
    );

  } catch (error) {
    console.log("Removal error:", error);
  }
}
}, 1000 * 60 * 60);
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
