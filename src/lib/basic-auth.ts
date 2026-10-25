// HTTP basic auth for the staging site. Pure functions so they are easy to test.

export function parseBasicAuth(header: string | null | undefined): { user: string; password: string } | undefined {
  if (!header) return undefined;
  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header.trim());
  if (!m) return undefined;
  let decoded: string;
  try {
    decoded = atob(m[1]);
  } catch {
    return undefined;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return undefined;
  return { user: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

/** Constant-time string comparison, so response timing does not leak the password. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export function isAuthorized(header: string | null | undefined, user: string, password: string): boolean {
  // Never allow access with an empty configured password: fail closed.
  if (!user || !password) return false;
  const creds = parseBasicAuth(header);
  if (!creds) return false;
  return safeEqual(creds.user, user) && safeEqual(creds.password, password);
}

/**
 * Body of the 401 page. Browsers show their own password prompt first; this page is what
 * appears if that prompt is cancelled (or in browsers that do not show one). Its form sends
 * the same basic auth credentials, which the browser then remembers for the site.
 */
export const UNAUTHORIZED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Staging: password required</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6f8;color:#0f172a;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  form{background:#fff;padding:32px;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.08);width:min(360px,90vw)}
  h1{font-size:20px;margin:0 0 4px} p{margin:0 0 20px;color:#475569;font-size:14px}
  label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px}
  button{margin-top:20px;width:100%;padding:11px;border:0;border-radius:8px;background:#0f766e;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
  .err{color:#b91c1c;font-size:13px;margin-top:12px;display:none}
</style></head>
<body><form id="f">
  <h1>This staging site is password protected</h1>
  <p>Enter the staging username and password to continue.</p>
  <label for="u">Username</label><input id="u" name="u" autocomplete="username" required>
  <label for="p">Password</label><input id="p" name="p" type="password" autocomplete="current-password" required>
  <button type="submit">Sign in to staging</button>
  <div class="err" id="e">Wrong username or password.</div>
</form>
<script>
document.getElementById('f').addEventListener('submit', function (ev) {
  ev.preventDefault();
  var x = new XMLHttpRequest();
  x.open('GET', location.pathname + location.search, true, document.getElementById('u').value, document.getElementById('p').value);
  x.onload = function () { if (x.status === 200) { location.reload(); } else { document.getElementById('e').style.display = 'block'; } };
  x.send();
});
</script></body></html>`;
