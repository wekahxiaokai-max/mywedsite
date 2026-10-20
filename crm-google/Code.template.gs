/**
 * 客户跟进记录本 — Google 版
 * 资料存在这份 Google Sheet 里，图片存在你的 Google Drive。
 * 同事打开网址、输入团队密码就能用，不需要登录任何账号。
 */

// ★ 团队密码：改成你们自己的，改完要重新部署（部署 → 管理部署 → 编辑 → 新版本）
const TEAM_PASSWORD = '__PASSWORD__';

const TABLES = {
  segments: { sheet: '客户类型', cols: ['id', 'name', 'note', 'order', 'createdAt'] },
  messages: { sheet: '发送记录', cols: ['id', 'segmentId', 'date', 'channel', 'status', 'content', 'images', 'by', 'createdAt', 'updatedAt'] },
};
const FOLDER_NAME = '客户跟进记录本 图片';

function doGet() {
  setup_();
  return HtmlService.createHtmlOutput(PAGE)
    .setTitle('客户跟进记录本')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 网页上所有的读写都经过这里，每次都先检查密码
function call(pw, op, a) {
  if (String(pw) !== TEAM_PASSWORD) throw new Error('WRONG_PASSWORD');
  a = a || {};
  if (op === 'list') return { segments: readAll_('segments'), messages: readAll_('messages') };
  if (op === 'upload') return upload_(a);
  if (op === 'trash') return trash_(a.id);
  if (!TABLES[a.col]) throw new Error('BAD_TABLE');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (op === 'add') return addRow_(a.col, a.data || {});
    if (op === 'update') return updateRow_(a.col, a.id, a.data || {});
    if (op === 'remove') return removeRow_(a.col, a.id);
  } finally {
    lock.releaseLock();
  }
  throw new Error('BAD_OP');
}

function setup_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ready') === '1') return;
  const ss = SpreadsheetApp.getActive();
  Object.keys(TABLES).forEach(function (k) {
    const t = TABLES[k];
    let sh = ss.getSheetByName(t.sheet);
    if (!sh) sh = ss.insertSheet(t.sheet);
    // 整张表都当文字存，内容以 = 开头也不会被当成公式
    sh.getRange(1, 1, sh.getMaxRows(), t.cols.length).setNumberFormat('@');
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols]).setFontWeight('bold');
      sh.setFrozenRows(1);
      const seed = (SEED[k] || []).map(function (r) { return toRow_(k, r); });
      if (seed.length) sh.getRange(2, 1, seed.length, t.cols.length).setValues(seed);
    }
  });
  const blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('工作表1');
  if (blank && ss.getSheets().length > 2 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  folder_();
  props.setProperty('ready', '1');
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('folderId');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('folderId', f.getId());
  return f;
}

function sheet_(k) { return SpreadsheetApp.getActive().getSheetByName(TABLES[k].sheet); }

function toRow_(k, obj) {
  return TABLES[k].cols.map(function (c) {
    let v = obj[c];
    if (v === undefined || v === null) return '';
    if (c === 'images') return (v || []).join(',');
    return String(v);
  });
}

function fromRow_(k, row) {
  const o = {};
  TABLES[k].cols.forEach(function (c, i) {
    const v = row[i] === undefined || row[i] === null ? '' : String(row[i]);
    if (c === 'images') o[c] = v ? v.split(',').filter(String) : [];
    else if (c === 'order') o[c] = Number(v) || 0;
    else o[c] = v;
  });
  return o;
}

function readAll_(k) {
  const sh = sheet_(k);
  if (sh.getLastRow() < 2) return [];
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, TABLES[k].cols.length).getValues();
  return vals.filter(function (r) { return r[0]; }).map(function (r) { return fromRow_(k, r); });
}

function findRow_(k, id) {
  const sh = sheet_(k);
  if (sh.getLastRow() < 2) return -1;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function addRow_(k, data) {
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  data.id = id;
  sheet_(k).appendRow(toRow_(k, data));
  return id;
}

function updateRow_(k, id, data) {
  const r = findRow_(k, id);
  if (r < 0) throw new Error('NOT_FOUND');
  const sh = sheet_(k);
  const range = sh.getRange(r, 1, 1, TABLES[k].cols.length);
  const cur = fromRow_(k, range.getValues()[0]);
  Object.keys(data).forEach(function (c) { if (c !== 'id' && TABLES[k].cols.indexOf(c) >= 0) cur[c] = data[c]; });
  range.setValues([toRow_(k, cur)]);
  return id;
}

function removeRow_(k, id) {
  const r = findRow_(k, id);
  if (r > 0) sheet_(k).deleteRow(r);
  return id;
}

function upload_(a) {
  const blob = Utilities.newBlob(Utilities.base64Decode(a.b64), a.mime || 'image/jpeg', a.name || ('图片-' + Date.now()));
  const file = folder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

// 只删除放在「客户跟进记录本 图片」文件夹里的图片，其他 Drive 文件碰不到
function trash_(id) {
  const file = DriveApp.getFileById(id);
  const fid = folder_().getId();
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === fid) { file.setTrashed(true); return id; }
  }
  throw new Error('NOT_OURS');
}

// 第一次打开时自动放进表格的旧资料（从 Claude 版搬过来的）
const SEED = __SEED__;

// 网页本身（由 build.py 自动生成，请不要手动改这一段）
const PAGE = __PAGE__;
