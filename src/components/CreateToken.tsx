"use client";

import { useActionState } from "react";
import { createTokenAction } from "@/app/admin/actions";

export function CreateToken() {
  const [state, action, pending] = useActionState(createTokenAction, null);
  return (
    <div>
      <form action={action} className="row">
        <input name="name" placeholder="Token name, for example Claude Desktop" className="mono" style={{ flex: 1, minWidth: 220, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)" }} />
        <button className="btn" type="submit" disabled={pending}>
          Create token
        </button>
      </form>
      {state?.token && (
        <div className="banner" style={{ marginTop: 12, flexDirection: "column", alignItems: "stretch" }}>
          <strong>Copy this token for “{state.name}” now. It will not be shown again.</strong>
          <code className="mono" style={{ wordBreak: "break-all" }}>{state.token}</code>
        </div>
      )}
    </div>
  );
}
