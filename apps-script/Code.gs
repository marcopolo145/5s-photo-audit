/**
 * 5S Photo Audit: Google Sheet + Drive backend.
 * Deploy as a Web app: Execute as = Me, Who has access = Anyone.
 * Then set Script property SECRET (Project settings > Script properties).
 * The Supabase function calls this with the secret; nobody else can use it.
 */
// The Sheet and Folder are created once by the 'setup' tool and remembered in Script properties.
function cfg_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
var HEADERS = ['Date','Who','For Whom','Area Name','1S Score','2S Score','3S Score','4S Score','Overall Score','Report Link'];

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return out_({ ok: true, message: '5S backend is running' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var b = JSON.parse(e.postData.contents);
    var secret = (typeof SECRET !== 'undefined' && SECRET) || PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || b.secret !== secret) return out_({ ok: false, error: 'forbidden' });
    var a = b.args || {};
    lock.waitLock(20000);
    var r;
    switch (b.tool) {
      case 'setup':         r = setup_(); break;
      case 'get_values':    r = getValues_(a); break;
      case 'update_values': r = updateValues_(a); break;
      case 'append_values': r = appendValues_(a); break;
      case 'create_file':   r = createFile_(a); break;
      default: return out_({ ok: false, error: 'unknown tool ' + b.tool });
    }
    return out_({ ok: true, result: r });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function ss_(a) {
  if (!cfg_('SHEET_ID') || a.spreadsheetId !== cfg_('SHEET_ID')) throw new Error('spreadsheet not allowed');
  return SpreadsheetApp.openById(cfg_('SHEET_ID'));
}

function getValues_(a) {
  return { values: ss_(a).getRange(a.range).getDisplayValues() };
}

function updateValues_(a) {
  var rng = ss_(a).getRange(a.range);
  var v = a.values;
  rng.offset(0, 0, v.length, v[0].length).setValues(v);
  return { updated: true };
}

function appendValues_(a) {
  var ss = ss_(a);
  var m = String(a.range).match(/^'?(.*?)'?!/);
  var sh = m ? ss.getSheetByName(m[1]) : ss.getSheets()[0];
  if (!sh) throw new Error('tab not found: ' + (m && m[1]));
  var rows = a.values, w = 0, i;
  for (i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
  var padded = rows.map(function (r) { var c = r.slice(); while (c.length < w) c.push(''); return c; });
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, padded.length, w).setValues(padded);
  return { appendedRows: padded.length, firstRow: start };
}

function createFile_(a) {
  if (!cfg_('FOLDER_ID') || a.parentId !== cfg_('FOLDER_ID')) throw new Error('folder not allowed');
  var bytes = Utilities.base64Decode(a.base64Content);
  var blob = Utilities.newBlob(bytes, a.contentMimeType || 'application/pdf', a.title);
  var f = DriveApp.getFolderById(cfg_('FOLDER_ID')).createFile(blob);
  return { id: f.getId(), webViewLink: f.getUrl() };
}

function setup_() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SHEET_ID')) {
    var ss = SpreadsheetApp.create('5S Audit Data');
    var sh = ss.getSheets()[0];
    sh.setName('Raw Data');
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    p.setProperty('SHEET_ID', ss.getId());
  }
  if (!p.getProperty('FOLDER_ID')) {
    p.setProperty('FOLDER_ID', DriveApp.createFolder('5S Folder').getId());
  }
  var sid = p.getProperty('SHEET_ID'), fid = p.getProperty('FOLDER_ID');
  return {
    sheetId: sid, sheetUrl: SpreadsheetApp.openById(sid).getUrl(),
    folderId: fid, folderUrl: DriveApp.getFolderById(fid).getUrl()
  };
}
