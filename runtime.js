/* Login (Supabase) and backend calls. Replaces the claude.ai-only runtime the page was built on. */
(function () {
  var C = window.APP_CONFIG || {};
  var ready = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  var sb = ready ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "s5-auth" }
  }) : null;
  function $(i) { return document.getElementById(i); }

  /* ---------- backend calls ---------- */
  async function token() {
    if (!sb) throw { code: "not_configured", message: "Login is not set up" };
    var r = await sb.auth.getSession();
    if (!r.data.session) throw { code: "not_signed_in", message: "Please sign in" };
    return r.data.session.access_token;
  }
  async function api(body) {
    var t = await token();
    var r = await fetch(C.SUPABASE_URL + "/functions/v1/api", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t, apikey: C.SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    });
    var j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok || j.error) throw { code: j.code || "http_" + r.status, message: j.error || r.statusText };
    return j;
  }
  function toB64(b) {
    return new Promise(function (ok, no) {
      if (typeof b === "string") { ok(b.replace(/^data:[^,]*,/, "")); return; }
      var f = new FileReader();
      f.onload = function () { ok(String(f.result).split(",")[1]); };
      f.onerror = no;
      f.readAsDataURL(b);
    });
  }

  /* Score 1S, 2S and 3S in three parallel calls (each about a third of the work), then merge. */
  var MARK = ["", "\nSORT indicators:", "\nSET IN ORDER indicators:", "\nSHINE indicators:"];
  var SNAME = ["", "Sort (1S)", "Set in Order (2S)", "Shine (3S)"];
  async function scoreInParts(p, im) {
    var a = p.indexOf("INDICATOR LIBRARY"), z = p.indexOf("\nReturn ONLY JSON:");
    var head = p.slice(0, a), lib = p.slice(p.indexOf(":", a) + 1, z);
    var i1 = lib.indexOf(MARK[1]), i2 = lib.indexOf(MARK[2]), i3 = lib.indexOf(MARK[3]);
    var seg = ["", lib.slice(i1, i2), lib.slice(i2, i3), lib.slice(i3)];
    var jobs = [];
    [1, 2, 3].forEach(function (s) {
      var lines = seg[s].split("\n").filter(function (x) { return x.trim(); }), title = lines.shift();
      for (var k = 0, c = 0; k < lines.length; k += 20, c++) {
        var chunk = lines.slice(k, k + 20);
        jobs.push({ s: s, first: c === 0, prompt: head + "FOCUS: this request covers ONLY the " + SNAME[s] + " indicators listed here. Give no other entries.\n" +
          "INDICATOR LIBRARY (only these; exactly one entry each):\n" + title + "\n" + chunk.join("\n") + "\n" +
          'Return ONLY JSON: {"why":"1-2 short sentences on what drove the points","evidence_level":n,"evidence_note":"...","summary":"one short sentence about this S","items":[{"id":"indicator ID","p":0-10 or null,"ph":photo number or 0,"o":"what you see, max 8 words"}],"actions":[{"s":' + s + ',"action":"specific corrective action","priority":"High|Medium|Low","minutes":n,"people":n,"ref":"indicator ID(s)"}],"photo_feedback":["retake or missing-view advice"]}\n' +
          "Give 1-3 actions for the lowest-scoring indicators here, with realistic minutes for one person and the number of people." });
      }
    });
    var res = await api({ action: "ai_multi", prompts: jobs.map(function (j) { return j.prompt; }), images: im });
    var out = { items: [], actions: [], photo_feedback: [], evidence_level: 3, evidence_note: "", summary: "", s1: { why: "" }, s2: { why: "" }, s3: { why: "" } };
    (res.json || []).forEach(function (r, i) {
      var j = jobs[i]; r = r || {};
      if (r.why) out["s" + j.s].why += (out["s" + j.s].why ? " " : "") + r.why;
      out.items = out.items.concat(r.items || []);
      out.actions = out.actions.concat(r.actions || []);
      (r.photo_feedback || []).forEach(function (f) { if (out.photo_feedback.indexOf(f) < 0) out.photo_feedback.push(f); });
      if (r.evidence_level && r.evidence_level < out.evidence_level) out.evidence_level = r.evidence_level;
      if (!out.evidence_note && r.evidence_note) out.evidence_note = r.evidence_note;
      if (j.first && r.summary) out.summary += (out.summary ? " " : "") + r.summary;
    });
    out.ai_model = res.model || ""; out.photo_hash = res.photo_hash || "";
    var rank = { High: 0, Medium: 1, Low: 2 };
    out.actions.sort(function (x, y) { return (rank[x.priority] == null ? 1 : rank[x.priority]) - (rank[y.priority] == null ? 1 : rank[y.priority]); });
    out.actions = out.actions.slice(0, 12);
    out.total_minutes = Math.round(out.actions.reduce(function (t, x) { return t + (+x.minutes || 0) / Math.max(1, +x.people || 1); }, 0));
    return out;
  }

  /* same shape the page already uses: claude.use("sample" | "mcp" | "downloads" | "db") */
  window.claude = {
    use: async function (n) {
      if (n === "sample") return {
        limits: async function () { return { images: true }; },
        json: async function (p, o) {
          var im = await Promise.all(((o && o.images) || []).map(toB64));
          if (/Assess ONLY/.test(p) && p.indexOf("INDICATOR LIBRARY") > -1) return scoreInParts(p, im);
          var r = await api({ action: "ai", prompt: p, images: im });
          return r.json;
        }
      };
      if (n === "mcp") return {
        listTools: async function () { return { fileArgs: false }; },
        callTool: async function (server, tool, args) {
          var r = await api({ action: "sheet", tool: tool, args: args });
          return { payload: r.result };
        }
      };
      if (n === "downloads") return {
        save: async function (o) {
          var b = o.data instanceof Blob ? o.data : new Blob([o.data]);
          var a = document.createElement("a");
          a.href = URL.createObjectURL(b); a.download = o.filename;
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        }
      };
      return null; /* lists stay in this browser (localStorage) */
    }
  };

  /* ---------- login screen ---------- */
  var gate = $("auth"), em = $("aem"), btn = $("asend"), gbtn = $("agoogle"), am = $("amsg"), so = $("so"), ue = $("ue");
  function note(t, bad) { am.textContent = t || ""; am.className = bad ? "err" : "note"; }
  function paint(s) {
    if (s) { gate.classList.add("hid"); ue.textContent = s.user.email; so.classList.remove("hid"); }
    else { gate.classList.remove("hid"); ue.textContent = ""; so.classList.add("hid"); }
  }
  if (!sb) {
    paint(null);
    note("Login is not set up yet. Add the Supabase keys in config.js.", true);
    btn.disabled = true; gbtn.classList.add("hid");
    return;
  }
  if (!C.GOOGLE_LOGIN) gbtn.classList.add("hid");
  sb.auth.getSession().then(function (r) { paint(r.data.session); });
  sb.auth.onAuthStateChange(function (ev, s) { paint(s); if (s && location.hash.indexOf("access_token") > -1) history.replaceState(null, "", location.pathname); });
  var pw = $("apw");
  btn.onclick = async function () {
    var e = em.value.trim();
    if (!e || !pw.value) { note("Enter your email and password.", true); return; }
    btn.disabled = true; note("Signing in\u2026");
    var r = await sb.auth.signInWithPassword({ email: e, password: pw.value });
    btn.disabled = false;
    if (r.error) note("Wrong email or password.", true); else { pw.value = ""; note(""); }
  };
  em.onkeydown = pw.onkeydown = function (e) { if (e.key === "Enter") btn.onclick(); };
  so.onclick = function () { sb.auth.signOut(); };
})();
