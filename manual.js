/* Manual scoring (no AI) and the step-by-step flow.
   The auditor rates every indicator from the 5S Indicators document. The ratings are turned into the same
   result object the AI used to return, so the scores, PDF, Sheet row and Drive link work unchanged. */
(function () {
  var C = window.APP_CONFIG || {};
  var MAN = !!C.MANUAL_SCORING;
  function g(i) { return document.getElementById(i); }
  var KEYS = MAN ? ["s1", "s2", "sr", "s3", "s4", "res"] : ["s1", "s2", "s3", "s4", "res"];
  var LBL = { s1: "Details", s2: "Photos", sr: "Rate", s3: "Legend", s4: "Submit", res: "Result" };
  var PTS = [["na", "N/A", null], ["poor", "Poor", 2], ["fair", "Fair", 5], ["good", "Good", 8], ["great", "Great", 10]];
  var VERB = { 1: "Remove or clear", 2: "Set a fixed place or label for", 3: "Clean and keep clean" };
  var MIN = { 1: [30, 15], 2: [45, 20], 3: [30, 15] }; /* minutes for one person: [Poor, Fair] */
  var RATE = {}, rtab = 1, step = 0, busy = false, msg = g("msg");

  function say(t) { msg.innerHTML = t ? '<span class="err">' + t + "</span>" : ""; }
  function rows() { return ids(envKey()); }
  function lblOf(k) { for (var i = 0; i < PTS.length; i++) if (PTS[i][0] === k) return PTS[i][1]; return ""; }

  /* ---------- checks ---------- */
  function ok1() { return g("date").value && g("who").value && g("whom").value.trim() && g("area").value.trim(); }
  function photosOk() { return g("th").children.length >= 4; }
  function legOk() { return !!g("legsel").value && (g("legsel").value === "n" || g("legth").children.length > 0); }
  function binOk() { return !!g("binsel").value && (g("binsel").value === "n" || g("binth").children.length >= 2); }
  function bothAvail() { return g("legsel").value === "y" && g("binsel").value === "y"; }
  function qOk() { return !MAN || !bothAvail() || (g("q4m").value && g("q4s").value && g("q4q").value); }
  function left() { return rows().filter(function (x) { return !RATE[x.id]; }).length; }
  function ratedAll() { return !MAN || left() === 0; }
  function resShown() { return !g("res").classList.contains("hid"); }
  function sel(i) { var e = g(i); return e.options && e.selectedIndex >= 0 ? e.options[e.selectedIndex].text : ""; }

  /* ---------- rating page ---------- */
  function counts() {
    var r = rows(), done = r.filter(function (x) { return RATE[x.id]; }).length;
    g("rcnt").textContent = done + " of " + r.length + " rated";
    [1, 2, 3].forEach(function (s) {
      var rs = r.filter(function (x) { return x.s === s; }), d = rs.filter(function (x) { return RATE[x.id]; }).length;
      var el = g("tb" + s); if (el) el.querySelector("i").textContent = d + "/" + rs.length;
    });
  }
  function renderRate() {
    var r = rows(), hints = window.HINTS || {};
    g("rtabs").innerHTML = [1, 2, 3].map(function (s) {
      var n = r.filter(function (x) { return x.s === s; }).length;
      return '<button type="button" id="tb' + s + '" class="tb' + (s === rtab ? " on" : "") + '" data-s="' + s + '">' + SN[s] + " <i>0/" + n + "</i></button>";
    }).join("");
    g("rlist").innerHTML = r.filter(function (x) { return x.s === rtab; }).map(function (x) {
      var cur = RATE[x.id], h = hints[x.id] || "";
      return '<div class="ir" data-id="' + x.id + '"><div class="it"><b>' + esc(x.name) + "</b>" + (h ? "<span>" + esc(h) + "</span>" : "") +
        '</div><div class="seg">' + PTS.map(function (o) {
          return '<button type="button" class="' + o[0] + (cur && cur.k === o[0] ? " sel" : "") + '" data-k="' + o[0] + '">' + o[1] + "</button>";
        }).join("") + "</div></div>";
    }).join("");
    counts();
  }
  if (MAN) {
    g("rtabs").onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      rtab = +b.dataset.s; renderRate();
    };
    g("rlist").onclick = function (e) {
      var b = e.target.closest(".seg button"); if (!b) return;
      var row = b.closest(".ir"), k = b.dataset.k, o = PTS.filter(function (p) { return p[0] === k; })[0];
      RATE[row.dataset.id] = { k: k, p: o[2] };
      [].forEach.call(row.querySelectorAll(".seg button"), function (x) { x.classList.toggle("sel", x === b); });
      counts(); paint();
    };
    g("rall").onclick = function () {
      rows().filter(function (x) { return x.s === rtab && !RATE[x.id]; }).forEach(function (x) { RATE[x.id] = { k: "good", p: 8 }; });
      renderRate(); paint();
    };
  } else if (g("sr")) { g("sr").remove(); }

  /* ---------- turn ratings into the result object ---------- */
  function mainResult() {
    var r = rows(), hints = window.HINTS || {}, items = [], sum = { 1: [0, 0], 2: [0, 0], 3: [0, 0] };
    r.forEach(function (x) {
      var v = RATE[x.id] || { k: "na", p: null };
      items.push({ id: x.id, p: v.p, ph: 0, o: v.p == null ? "Not rated (N/A)" : "Auditor rated: " + lblOf(v.k) });
      if (v.p != null) { sum[x.s][0] += v.p; sum[x.s][1]++; }
    });
    var low = r.filter(function (x) { return RATE[x.id] && RATE[x.id].p != null && RATE[x.id].p <= 5; })
      .sort(function (a, b) { return RATE[a.id].p - RATE[b.id].p || a.s - b.s; });
    var act = low.slice(0, 12).map(function (x) {
      var poor = RATE[x.id].p <= 3;
      return { s: x.s, action: VERB[x.s] + ": " + x.name, priority: poor ? "High" : "Medium", minutes: MIN[x.s][poor ? 0 : 1], people: 1, ref: x.id };
    });
    var mins = act.reduce(function (a, b) { return a + b.minutes; }, 0);
    var worst = 1, wv = 99;
    [1, 2, 3].forEach(function (s) { var a = sum[s][1] ? sum[s][0] / sum[s][1] : 10; if (a < wv) { wv = a; worst = s; } });
    var out = {
      evidence_level: 3, evidence_note: "Rated by the auditor from the photos.",
      summary: low.length ? "Lowest area: " + SN[worst] + ". " + low.length + " point" + (low.length > 1 ? "s" : "") + " need action." + (low.length > 12 ? " The 12 most urgent are listed." : "")
        : "No point needs action. Keep it up.",
      items: items, actions: act, total_minutes: mins,
      photo_feedback: g("rnote").value.trim() ? [g("rnote").value.trim()] : []
    };
    [1, 2, 3].forEach(function (s) {
      out["s" + s] = { why: sum[s][1] ? "Rated by the auditor. " + sum[s][1] + " points rated. Average " + (sum[s][0] / sum[s][1]).toFixed(1) + " of 10." : "No points were rated." };
    });
    return out;
  }
  function s4Result() {
    var y = function (i) { return g(i).value === "y"; };
    return {
      legend: { present: true, legible: true, entries: [], note: "Photo added by the auditor." },
      binlist: { present: true, legible: true, rack: g("s4rack").value, bin: g("s4bin").value, items: [], note: "Photo added by the auditor." },
      match: { names_match: y("q4m"), location_match: y("q4m"), note: "Answered by the auditor." },
      stored: { item_present: y("q4s"), note: "Answered by the auditor." },
      quality: { legend_good: y("q4q"), binlist_good: y("q4q") }
    };
  }
  if (MAN) {
    var base = window.claude.use;
    window.claude.use = async function (n) {
      if (n === "sample") return {
        limits: async function () { return { images: true }; },
        json: async function (p) { return /Assess ONLY/.test(p) ? mainResult() : s4Result(); }
      };
      return base(n);
    };
    g("s4q").classList.remove("man-off");
  }
  function d4q() { if (MAN) g("s4q").classList.toggle("hid", !bothAvail()); }
  g("legsel").addEventListener("change", d4q); g("binsel").addEventListener("change", d4q);

  /* ---------- steps ---------- */
  g("steps").innerHTML = KEYS.map(function (k) { return '<button type="button" id="st_' + k + '">' + LBL[k] + "</button>"; }).join("");
  KEYS.forEach(function (k, i) {
    var pg = g(k), n = pg && pg.querySelector(".n"); if (n) n.dataset.i = i + 1;
  });
  var MSG = {
    s1: function () { return "Fill all * fields."; },
    s2: function () { return "Add 4 or 5 photos."; },
    sr: function () {
      var f = rows().filter(function (x) { return !RATE[x.id]; })[0]; if (f) rtab = f.s;
      return "Rate all points. " + left() + " left.";
    },
    s3: function () { return !g("legsel").value ? "Answer question 1." : !legOk() ? "Add the Master Legend photo." : !g("binsel").value ? "Answer question 2." : !binOk() ? "Add 2 photos at the rack or bin." : "Answer the 3 questions."; }
  };
  function okKey(k) {
    switch (k) {
      case "s1": return !!ok1(); case "s2": return photosOk(); case "sr": return ratedAll();
      case "s3": return legOk() && binOk() && !!qOk(); default: return resShown();
    }
  }
  function guard(to) {
    for (var i = 0; i < to; i++) {
      var k = KEYS[i];
      if (k === "s4" || k === "res") continue;
      if (!okKey(k)) {
        var m = MSG[k]();
        if (i !== step) view(i);
        if (k === "sr") renderRate();
        say(m); return false;
      }
    }
    return true;
  }
  function review() {
    var rs = [["Date", g("date").value], ["Auditor", sel("who") + (g("wname").value ? " – " + g("wname").value : "")],
      ["Auditee", g("whom").value], ["Area", g("area").value + (sel("env") ? " (" + sel("env") + ")" : "")],
      ["Photos", g("th").children.length + " area photos"]];
    if (MAN) rs.push(["Points rated", rows().length - left() + " of " + rows().length]);
    rs.push(["Master Legend", g("legsel").value === "n" ? "Not Available" : (g("legth").children.length ? "Photo added" : "Missing")]);
    rs.push(["Rack / bin list", g("binsel").value === "n" ? "Not Available" : g("binth").children.length + " photos"]);
    g("rv").className = "rv";
    g("rv").innerHTML = rs.map(function (r) { return "<b>" + r[0] + "</b><span>" + esc(r[1]) + "</span>"; }).join("");
    g("rvt").innerHTML = [].map.call(g("th").querySelectorAll("img"), function (im) { return '<div><img src="' + im.src + '" alt=""></div>'; }).join("");
  }
  function view(i) {
    step = i; var k = KEYS[i];
    ["s1", "s2", "sr", "s3", "s4"].forEach(function (p) { var el = g(p); if (el) el.classList.toggle("cur", p === k); });
    g("res").style.display = k === "res" ? "" : "none";
    if (k !== "res") g("mgr").classList.add("hid");
    if (k === "sr") renderRate();
    if (k === "s3") d4q();
    if (k === "s4") review();
    g("bk").classList.toggle("hid", i === 0); g("bk").textContent = k === "res" ? "Edit" : "Back";
    g("nx").classList.toggle("hid", k === "s4" || k === "res");
    g("go").classList.toggle("hid", k !== "s4"); g("nw").classList.toggle("hid", k !== "res");
    say(""); paint(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function paint() {
    KEYS.forEach(function (k, i) {
      var b = g("st_" + k), d = okKey(k);
      b.className = i === step ? "on" : (d ? "ok" : "");
      var pg = g(k), n = pg && pg.querySelector(".n");
      if (n) { n.className = "n" + (d ? " done" : ""); n.textContent = d ? "✓" : n.dataset.i; }
    });
    g("xls").classList.toggle("hid", !g("dm").querySelector(".err"));
  }
  g("nx").onclick = function () { if (guard(step + 1)) view(step + 1); };
  g("bk").onclick = function () { if (busy) return; view(KEYS[step] === "res" ? 0 : step - 1); };
  g("nw").onclick = function () { if (confirm("Start a new audit? This clears the page.")) location.reload(); };
  KEYS.forEach(function (k, i) {
    g("st_" + k).onclick = function () {
      if (busy) return;
      if (k === "res") { if (resShown()) view(i); else say("Submit first."); return; }
      if (guard(i)) view(i);
    };
  });

  /* Submit: the result opens as soon as scoring is done; saving to Sheet and Drive continues with a visible banner. */
  var orig = g("go").onclick, shown = false, t0 = 0, tick = null;
  function bar(cls, html) { var s = g("savebar"); s.className = "savebar" + (cls ? " " + cls : ""); s.innerHTML = html; }
  function startProg() {
    t0 = Date.now(); g("prog").classList.remove("hid");
    g("pl").innerHTML = ["Issuing the document number", "Scoring the photos"].map(function (t, i) { return '<li id="pl' + i + '" class="' + (i === 1 ? "on" : "") + '">' + t + "</li>"; }).join("");
    tick = setInterval(function () {
      var s = (Date.now() - t0) / 1000, p = 92 * (1 - Math.exp(-s / 7));
      g("pfill").style.width = Math.max(3, p) + "%";
      g("pst").textContent = (s > 30 ? "Taking a little longer\u2026 " : "Scoring your photos\u2026 ") + Math.round(s) + " s. Please keep this page open.";
      if (window.__docNo) { g("pl0").className = "done"; }
    }, 400);
  }
  function stopProg() { clearInterval(tick); g("prog").classList.add("hid"); g("pfill").style.width = "3%"; }
  function mirrorSave() {
    if (!busy && !shown) return;
    var t = g("dm").textContent || "", bad = !!g("dm").querySelector(".err");
    if (bad) bar("bad", t);
    else if (/Saved to the Google Sheet/.test(t)) bar("ok", "\u2713 Submitted. " + g("dm").innerHTML);
    else bar("", "Saving to the Google Sheet and the 5S Folder\u2026 please keep this page open. " + (window.__docNo ? "Document No: " + esc(window.__docNo) + "." : ""));
  }
  function early() {
    if (busy && resShown() && !shown) {
      shown = true; stopProg(); view(KEYS.length - 1); mirrorSave();
    }
  }
  window.addEventListener("beforeunload", function (e) { if (busy) { e.preventDefault(); e.returnValue = ""; return ""; } });
  g("go").onclick = async function () {
    if (!guard(KEYS.indexOf("s4"))) return;
    if (window.prefetchDoc) window.prefetchDoc();
    busy = true; shown = false; g("bk").disabled = true; g("nw").disabled = true; g("go").disabled = true; g("go").textContent = "Submitting\u2026";
    startProg();
    try { await orig.call(this); } finally {
      busy = false; g("bk").disabled = false; g("nw").disabled = false; g("go").disabled = false; g("go").textContent = "Submit"; stopProg();
    }
    if (resShown()) {
      if (!shown) { shown = true; view(KEYS.length - 1); }
      mirrorSave();
      if (/Saved to the Google Sheet/.test(g("dm").textContent)) confetti();
    }
  };
  function confetti() {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var c = document.createElement("canvas");
    c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50";
    c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
    var x = c.getContext("2d"), col = ["#1f3fe0", "#14143c", "#e5283a", "#12874a", "#f2b01e", "#6c8cff"], P = [];
    for (var i = 0; i < 140; i++) P.push({ x: innerWidth / 2 + (Math.random() - .5) * 160, y: innerHeight * .75, vx: (Math.random() - .5) * 16, vy: -8 - Math.random() * 13, w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: col[i % col.length] });
    var t0 = performance.now();
    (function f(t) {
      var e = t - t0; x.clearRect(0, 0, c.width, c.height);
      P.forEach(function (p) { p.vy += .32; p.vx *= .992; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.globalAlpha = Math.max(0, 1 - e / 3200); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore(); });
      if (e < 3200) requestAnimationFrame(f); else c.remove();
    })(t0);
  }

  new MutationObserver(function () { paint(); early(); }).observe(g("res"), { attributes: true, attributeFilter: ["class"] });
  new MutationObserver(function () { paint(); mirrorSave(); }).observe(g("dm"), { childList: true, subtree: true, characterData: true });
  document.addEventListener("input", paint); document.addEventListener("change", paint);
  document.addEventListener("click", function () { setTimeout(paint, 60); });
  setInterval(paint, 800);
  var cn = g("cnt");
  function fc() { var m = cn.textContent.match(/^(\d+)/); if (m && !/ of 4/.test(cn.textContent)) cn.textContent = m[1] + " of 4–5"; }
  new MutationObserver(fc).observe(cn, { childList: true }); fc();
  /* camera + gallery buttons, and the Yes / No questions */
  function wireCam(btn, input, gallery) {
    g(btn).onclick = function () { g(input).click(); };
    g(input).onchange = function (e) { var h = g(gallery).onchange; if (h) return h.call(this, e); };
  }
  wireCam("pickcam", "cam", "file"); wireCam("legcam", "legc", "legf"); wireCam("bincam", "binc", "binf");
  [].forEach.call(document.querySelectorAll(".yn button"), function (b) {
    b.onclick = function () {
      var sl = g(b.dataset.t); sl.value = b.dataset.v; sl.dispatchEvent(new Event("change"));
      [].forEach.call(b.parentNode.children, function (x) { x.classList.toggle("sel", x === b); });
      d4q(); paint();
    };
  });
  view(0);
})();
