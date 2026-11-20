/* Document number + fast save.
   - The document number (for example MPP/5S/26-27/0001) is requested when Submit is pressed, in parallel with scoring.
   - After scoring, ONE call saves the PDF in the Drive folder and adds the row (with the link and Doc No) to the Sheet.
   A number is kept for the whole attempt, so a retry after an error reuses it and no number is wasted. */
(function () {
  var C = window.APP_CONFIG || {};
  function fyOf(d) { /* Indian financial year (April to March): 2026-11-20 -> 26-27 */
    var y = +String(d).slice(0, 4), m = +String(d).slice(5, 7), a = m >= 4 ? y : y - 1;
    return String(a).slice(2) + "-" + String(a + 1).slice(2);
  }
  function getDocNo() {
    if (window.__docNo) return Promise.resolve(window.__docNo);
    if (!window.__docP) {
      window.__docP = (async function () {
        var mcp = await claude.use("mcp"), m = meta();
        var r = await mcp.callTool(SH.server, "next_doc", { spreadsheetId: SH.id, fy: fyOf(m.date), prefix: C.DOC_PREFIX || "MPP/5S" });
        var n = r && r.payload && r.payload.docNo;
        if (!n) throw { code: "no_doc_no", message: "No document number returned" };
        window.__docNo = n; return n;
      })().catch(function (e) { window.__docP = null; throw e; });
    }
    return window.__docP;
  }
  window.prefetchDoc = function () { getDocNo().catch(function () {}); };

  if (SH_H.length < 11) SH_H.push("Doc No");

  window.sheetSave = async function (auto) {
    if (!R || !R.s4) return;
    var mm = $("dm"), b = $("xls");
    var mcp = await claude.use("mcp");
    if (!mcp) { mm.innerHTML = '<span class="err">Google Sheets / Drive is not available.</span>'; return; }
    if (R.saved && !auto && !confirm("This audit is already saved. Save it again?")) return;
    b.disabled = true;
    try {
      mm.textContent = "Getting the document number…";
      R.docNo = R.docNo || await getDocNo();
      mm.textContent = "Saving the PDF and the row…";
      var bl = mkpdf();
      if (!bl) throw { code: "pdf_failed", message: "The PDF could not be made" };
      var buf = await bl.arrayBuffer();
      if (buf.byteLength > 3500000) throw { code: "pdf_too_large", message: "The PDF is too large" };
      var m = meta();
      var res = await mcp.callTool(SH.server, "submit", {
        spreadsheetId: SH.id, folderId: DR.folder, fileName: fname("pdf"), pdf: b64(buf),
        row: [m.date, m.who, m.whom, m.area, R.sub[1].score, R.sub[2].score, R.sub[3].score, R.s4.score, R.total, "", R.docNo]
      });
      var out = (res && res.payload) || {};
      R.link = out.link || ""; R.saved = true;
      mm.innerHTML = "<b>Document No: " + esc(R.docNo) + "</b>. Saved to the Google Sheet." +
        (R.link ? " PDF saved in the 5S Folder (link in the Report Link column)." : ' <span class="err">The row is saved but the PDF was not (' + esc(out.err || "unknown") + ").</span>");
      window.__docNo = null; window.__docP = null; /* next audit gets a new number */
    } catch (x) {
      var c = x && x.code, t;
      if (c === "forbidden") t = "This account is not allowed.";
      else if (c === "no_doc_no" || c === "tool_error") t = "Google did not confirm the save: " + esc(((x.message || "") + "").slice(0, 160)) + ". Check the Sheet before saving again.";
      else if (c === "pdf_failed") t = "The PDF could not be made.";
      else if (c === "pdf_too_large") t = "The PDF is too large to save.";
      else t = "The save did not finish (" + esc(c || (x && x.message) || "error") + ").";
      mm.innerHTML = '<span class="err">' + t + "</span>";
    }
    b.disabled = false;
  };
})();
