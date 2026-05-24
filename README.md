# Telegram Subscription Bot

Telegram subscription bot using Node.js, Telegraf, Railway, and Flutterwave.

## Railway variables

Set these in Railway. Do not commit real secrets to GitHub.

```env
BOT_TOKEN=
TIER1_GROUP_ID=
TIER2_GROUP_ID=
FLW_PUBLIC_KEY=
FLW_SECRET_KEY=
FLW_HASH=
```

## Run

```bash
npm install
npm start
```

## Flutterwave next step

The bot now creates Flutterwave payment links for:

- Tier 1: NGN 5,000
- Tier 2: NGN 10,000

Each payment includes metadata for `tier`, `telegram_user_id`, `telegram_username`, and the correct Telegram group ID.

Next, add a webhook endpoint that:

1. Verifies the Flutterwave webhook with `FLW_HASH`.
2. Confirms the transaction status with Flutterwave.
3. Reads `meta.tier` and `meta.telegram_user_id`.
4. Creates or sends the correct private Telegram invite link for `TIER1_GROUP_ID` or `TIER2_GROUP_ID`.
