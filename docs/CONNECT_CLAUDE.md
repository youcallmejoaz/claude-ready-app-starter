# Connect Claude to your data

The connector is the MCP server at `https://<your MCP domain>/mcp`. It only reads, and every
request needs a connector token.

## 1. Create a token

On the app's **Data & connector** page, type a name (for example "Claude for the team") and
click **Create token**. Copy the token straight away: it is shown once and stored only as a
hash. You can also run `npm run token -- create "Claude for the team"`.

To cut off access later, click **Revoke** next to the token. It stops working immediately.

## 2. Add it to Claude

### Claude (claude.ai, Desktop, mobile): custom connector

1. Open **Settings > Connectors** and choose **Add custom connector**.
2. Name: `Marketing data`. URL: `https://<your MCP domain>/mcp`.
3. Under **Request headers**, add `Authorization` with the value `Bearer <your token>`.
4. Save, then turn the connector on in a chat and ask, for example,
   "Which campaign had the best cost per conversion last month?"

Claude stores the header securely and sends it on every request. Everyone who uses this
connector shares the token's access (read only, analytics tables only). On Team and Enterprise
plans an owner adds the connector for the organisation.

### Claude Code

```bash
claude mcp add --transport http marketing-data https://<your MCP domain>/mcp \
  --header "Authorization: Bearer <your token>"
```

### Claude API (MCP connector)

Pass the URL and the token as `authorization_token` in `mcp_servers`. The server must be
reachable from the internet over HTTPS, which the AWS setup provides.

## What Claude can and cannot do

| Can | Cannot |
|---|---|
| List the analytics tables (`describe_schema`) | See user accounts, connector tokens or the audit log |
| Traffic totals and daily figures (`traffic_summary`) | Insert, update, delete or change any table |
| Campaign results and cost per conversion (`campaign_performance`) | Run more than one statement, or anything but SELECT |
| Top landing pages (`top_landing_pages`) | Run a query longer than 5 seconds or get more than 500 rows |
| One read-only SELECT (`run_select`) | Call without a valid, unrevoked token |

Every call, including blocked and rejected ones, is listed in the audit log on the
**Data & connector** page.
