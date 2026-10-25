# Connecting real Google Ads and GA4 data

Demo mode uses sample data. To sync your real numbers, set `DEMO_MODE=0` and switch on the
adapters you want with `GOOGLE_ADS_ENABLED=1` and `GA4_ENABLED=1`.

Both adapters share one Google OAuth client and one refresh token (a long-lived permission
granted once by an account that can see the data). Signing in to the app does **not** grant
access to Ads or Analytics; that only happens here.

## What you need

| Item | Where it comes from | Variable |
|---|---|---|
| OAuth client (Web application) | Google Cloud Console > APIs & Services > Credentials | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| Refresh token with scopes `https://www.googleapis.com/auth/adwords` and `https://www.googleapis.com/auth/analytics.readonly` | Google OAuth Playground (use your own client) or any OAuth helper | `GOOGLE_OAUTH_REFRESH_TOKEN` |
| Google Ads developer token | Google Ads > Tools > API Center. **Production use needs an approved token** (Basic access or higher); a test token only works on test accounts. | `GOOGLE_ADS_DEVELOPER_TOKEN` |
| Google Ads account id | Top right of Google Ads, `123-456-7890` | `GOOGLE_ADS_CUSTOMER_ID` |
| Manager (MCC) id, only if you sign in through a manager account | Google Ads | `GOOGLE_ADS_LOGIN_CUSTOMER_ID` |
| GA4 property id | GA4 > Admin > Property details | `GA4_PROPERTY_ID` |

Enable the **Google Ads API** and **Google Analytics Data API** in the same Google Cloud project.

## What is synced

| Source | API | Fields |
|---|---|---|
| Google Ads | `googleAds:searchStream` (GAQL on `campaign`, segmented by date) | campaign id, name, type, status, cost, impressions, clicks, conversions |
| GA4 | Data API `runReport` | per day: sessions, total users, key events (conversions); per day and landing page: the same |

Each sync upserts by (campaign, date) or (date, landing page), so it can run as often as you
like. The nightly job re-syncs the last 3 days, because Google revises recent numbers.

## Honest limits

- The live adapters are covered by tests with mocked Google responses. They have not been run
  against a real Google Ads or GA4 account in this build.
- Cost is stored in the Ads account currency; the dashboard shows it with a `$` sign.
- GA4 now calls conversions "key events"; the adapter reads `keyEvents`.
