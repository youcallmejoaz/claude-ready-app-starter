import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { TopBar } from "@/components/TopBar";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Only these repository files can be shown. The slug never becomes a file path.
const DOCS: Record<string, { file: string; load: () => Promise<string> }> = {
  "claude-md": { file: "CLAUDE.md", load: () => readFile(path.join(process.cwd(), "CLAUDE.md"), "utf8") },
  "how-to-deploy": { file: "docs/HOW_TO_DEPLOY.md", load: () => readFile(path.join(process.cwd(), "docs", "HOW_TO_DEPLOY.md"), "utf8") },
};

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const doc = DOCS[(await params).slug];
  if (!doc) notFound();
  const markdown = await doc.load();
  // Trusted content from this repository, rendered as HTML.
  const html = await marked.parse(markdown);
  return (
    <>
      <TopBar current="/docs/claude-md" userName={user.name} />
      <main className="page">
        <div className="seg" style={{ marginBottom: 20 }}>
          {Object.entries(DOCS).map(([slug, d]) => (
            <a key={slug} href={`/docs/${slug}`} aria-current={d === doc ? "true" : undefined}>
              {d.file}
            </a>
          ))}
        </div>
        <article className="card doc" dangerouslySetInnerHTML={{ __html: html }} />
      </main>
    </>
  );
}
