// The demo console: connects to the MCP server exactly like Claude does (MCP client SDK,
// Streamable HTTP, bearer token), then either replays a recorded answer (demo mode) or
// lets Claude pick the tools (DEMO_MODE=0 with ANTHROPIC_API_KEY).
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHmac } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { mcpTokens } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { generateToken, hashToken } from "@/lib/mcp-tokens";
import { lastNDays, today } from "@/lib/dates";
import recorded from "../../../fixtures/console/recorded-answers.json";
import { render, renderArgs } from "./template";

export interface ConsoleStep {
  tool: string;
  args: Record<string, unknown>;
  isError: boolean;
  result: unknown;
}

export interface ConsoleAnswer {
  mode: "recorded" | "live";
  question: string;
  steps: ConsoleStep[];
  answer: string;
  blocked: boolean;
}

export interface ToolInfo {
  name: string;
  description?: string;
}

const CONSOLE_TOKEN_NAME = "Demo console";
const g = globalThis as unknown as { consoleToken?: string };

/**
 * The console needs a connector token like any other client. Use MCP_CONSOLE_TOKEN when set.
 * Otherwise derive one from AUTH_SECRET, so every app instance shares the same token (stored
 * hashed). Revoking it on the admin page cuts the console off until AUTH_SECRET changes.
 */
async function consoleToken(): Promise<string> {
  if (env.mcpConsoleToken) return env.mcpConsoleToken;
  if (g.consoleToken) return g.consoleToken;
  const secret = process.env.AUTH_SECRET;
  const token = secret
    ? `mcp_${createHmac("sha256", secret).update("demo-console-token").digest("base64url")}`
    : generateToken();
  await getDb()
    .insert(mcpTokens)
    .values({ name: CONSOLE_TOKEN_NAME, tokenHash: hashToken(token) })
    .onConflictDoNothing({ target: mcpTokens.tokenHash });
  g.consoleToken = token;
  return token;
}

async function withMcp<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const token = await consoleToken();
  const client = new Client({ name: "demo-console", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(env.mcpUrl), { requestInit: { headers: { authorization: `Bearer ${token}` } } }),
  );
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function callTool(client: Client, tool: string, args: Record<string, unknown>): Promise<ConsoleStep> {
  const res = (await client.callTool({ name: tool, arguments: args })) as { isError?: boolean; content?: { type: string; text?: string }[] };
  const text = (res.content ?? []).map((c) => c.text ?? "").join("\n");
  let result: unknown = text;
  try {
    result = JSON.parse(text);
  } catch {
    // Errors and blocked calls come back as plain text.
  }
  return { tool, args, isError: Boolean(res.isError), result };
}

export async function listTools(): Promise<ToolInfo[]> {
  return withMcp(async (client) => (await client.listTools()).tools.map((t) => ({ name: t.name, description: t.description })));
}

export const SUGGESTED_QUESTIONS = recorded.answers.map((a) => a.question);

function findRecorded(question: string) {
  const q = question.toLowerCase();
  return recorded.answers.find((a) => a.match.some((m) => q.includes(m)));
}

async function askRecorded(question: string): Promise<ConsoleAnswer> {
  const entry = findRecorded(question);
  if (!entry) {
    return {
      mode: "recorded",
      question,
      steps: [],
      blocked: false,
      answer:
        "Demo mode can only replay the recorded questions. Pick one of the suggestions, or set ANTHROPIC_API_KEY and DEMO_MODE=0 to ask Claude anything.",
    };
  }
  return withMcp(async (client) => {
    const steps: ConsoleStep[] = [];
    for (const s of entry.steps) steps.push(await callTool(client, s.tool, renderArgs(s.args)));
    return {
      mode: "recorded",
      question,
      steps,
      blocked: steps.some((s) => s.isError),
      answer: render(entry.answer, steps.map((s) => s.result)),
    };
  });
}

async function askLive(question: string): Promise<ConsoleAnswer> {
  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  const last30 = lastNDays(30);
  return withMcp(async (client) => {
    const { tools } = await client.listTools();
    const claudeTools: Anthropic.Beta.BetaTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    }));
    const system =
      `You answer a business owner's questions about their marketing data using the read-only connector tools. ` +
      `Today is ${today()} (UTC). "Last 30 days" means ${last30.start} to ${last30.end}. ` +
      `You cannot change data; if asked to, try the request through run_select so the attempt is logged, then explain it was blocked. ` +
      `Answer in two or three short sentences of plain English, with the key numbers in bold using **like this**.`;
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question }];
    const steps: ConsoleStep[] = [];

    for (let turn = 0; turn < 8; turn++) {
      const response = await anthropic.beta.messages.create({
        model: env.anthropicModel,
        max_tokens: 16000,
        system,
        tools: claudeTools,
        messages,
        output_config: { effort: "medium" },
        // Server-side fallback if the model declines a request.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      if (response.stop_reason === "refusal") {
        return { mode: "live", question, steps, blocked: false, answer: "Claude declined to answer this question." };
      }
      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use" || !toolUses.length) {
        const answer = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n\n");
        return { mode: "live", question, steps, blocked: steps.some((s) => s.isError), answer };
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const step = await callTool(client, use.name, use.input as Record<string, unknown>);
        steps.push(step);
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: typeof step.result === "string" ? step.result : JSON.stringify(step.result),
          is_error: step.isError,
        });
      }
      messages.push({ role: "user", content: results });
    }
    return { mode: "live", question, steps, blocked: false, answer: "Stopped after 8 tool rounds without a final answer." };
  });
}

export function liveModeAvailable(): boolean {
  return !env.demoMode && Boolean(env.anthropicApiKey);
}

export async function ask(question: string): Promise<ConsoleAnswer> {
  return liveModeAvailable() ? askLive(question) : askRecorded(question);
}
