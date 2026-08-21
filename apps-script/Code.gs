/**
 * 2027학년도 입학사정관 모의평가 교육 신청 시스템 — 백엔드
 * 울산대학교 입학관리팀
 *
 * 배포 방법
 *   1) 신청 데이터를 담을 Google Sheets 를 열고 [확장 프로그램 > Apps Script] 실행
 *   2) 이 파일 전체를 붙여넣고 저장
 *   3) [배포 > 새 배포 > 유형: 웹 앱]
 *        - 실행 계정      : 나
 *        - 액세스 권한    : 모든 사용자
 *   4) 생성된 웹 앱 URL 을 signup-app/config.json 의 apiUrl 에 기입
 *
 * ※ 코드를 수정한 뒤에는 반드시 [배포 > 배포 관리 > 편집 > 새 버전] 으로 재배포해야
 *    변경 사항이 반영됩니다.
 */

var SHEET_ROSTER = '명단';
var SHEET_COHORT = '차수';
var SHEET_APPLY  = '신청';
var SHEET_LOG    = '이력';
var SHEET_CONF   = '설정';

var LOCK_TIMEOUT_MS = 30000;

/* ==========================================================================
   진입점
   ========================================================================== */

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: '요청 형식이 올바르지 않습니다.' });
  }

  try {
    return json(route(req.action, req));
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return json({ ok: true, service: '모의평가 교육 신청 API', version: 1 });
}

function route(action, p) {
  switch (action) {
    case 'config':      return apiConfig();
    case 'verify':      return apiVerify(p);
    case 'apply':       return apiApply(p);
    case 'cancel':      return apiCancel(p);
    case 'adminLogin':  return apiAdminLogin(p);
    case 'adminData':   return apiAdminData(p);
    case 'adminUpdate': return apiAdminUpdate(p);
    case 'adminConfig': return apiAdminConfig(p);
    default:            return { ok: false, error: '알 수 없는 요청입니다: ' + action };
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================================
   시트 접근
   ========================================================================== */

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet(name) {
  var sh = ss().getSheetByName(name);
  if (!sh) throw new Error('시트를 찾을 수 없습니다: ' + name);
  return sh;
}

/** 헤더를 제외한 전체 행을 객체 배열로 반환 */
function readAll(name) {
  var sh = sheet(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return values.map(function (row) {
    var o = {};
    head.forEach(function (h, i) { o[String(h).trim()] = row[i]; });
    return o;
  }).filter(function (o) {
    return Object.keys(o).some(function (k) { return String(o[k]).trim() !== ''; });
  });
}

function str(v) { return String(v == null ? '' : v).trim(); }

/** 날짜 셀을 yyyy-MM-dd 문자열로 정규화 */
function isoDate(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return str(v);
}

function now() {
  return Utilities.formatDate(new Date(), ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function conf(key, fallback) {
  var rows = readAll(SHEET_CONF);
  for (var i = 0; i < rows.length; i++) {
    if (str(rows[i]['키']) === key) {
      var v = rows[i]['값'];
      if (key === '신청마감일시' && v instanceof Date) {
        return Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), "yyyy-MM-dd'T'HH:mm");
      }
      return str(v);
    }
  }
  return fallback;
}

function setConf(key, value) {
  var sh = sheet(SHEET_CONF);
  var last = sh.getLastRow();
  for (var r = 2; r <= last; r++) {
    if (str(sh.getRange(r, 1).getValue()) === key) {
      sh.getRange(r, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

/* ==========================================================================
   도메인 조회
   ========================================================================== */

function getCohorts() {
  var applies = readAll(SHEET_APPLY);
  return readAll(SHEET_COHORT).map(function (c) {
    var id = str(c['차수ID']);
    var taken = 0, wait = 0;
    applies.forEach(function (a) {
      if (str(a['차수ID']) !== id) return;
      var s = str(a['상태']);
      if (s === '확정') taken++;
      else if (s === '대기') wait++;
    });
    return {
      id: id,
      name: str(c['차수명']),
      d1: isoDate(c['1일차']),
      d2: isoDate(c['2일차']),
      cap: Number(c['정원']) || 0,
      closed: str(c['마감여부']).toUpperCase() === 'Y',
      taken: taken,
      wait: wait
    };
  });
}

function findRoster(no, name) {
  var rows = readAll(SHEET_ROSTER);
  for (var i = 0; i < rows.length; i++) {
    if (str(rows[i]['사번']) === str(no) && str(rows[i]['성명']) === str(name)) {
      return {
        no: str(rows[i]['사번']),
        name: str(rows[i]['성명']),
        unit: str(rows[i]['평가모집단위']),
        college: str(rows[i]['단과대학']),
        kind: str(rows[i]['구분'])
      };
    }
  }
  return null;
}

function rosterByNo(no) {
  var rows = readAll(SHEET_ROSTER);
  for (var i = 0; i < rows.length; i++) {
    if (str(rows[i]['사번']) === str(no)) {
      return {
        no: str(rows[i]['사번']),
        name: str(rows[i]['성명']),
        unit: str(rows[i]['평가모집단위']),
        college: str(rows[i]['단과대학']),
        kind: str(rows[i]['구분'])
      };
    }
  }
  return null;
}

/** 신청 시트에서 해당 사번의 유효한(취소가 아닌) 행 번호를 찾는다 */
function findApplyRow(no) {
  var sh = sheet(SHEET_APPLY);
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var values = sh.getRange(2, 1, last - 1, 4).getValues(); // 사번,성명,차수ID,상태
  for (var i = 0; i < values.length; i++) {
    if (str(values[i][0]) === str(no) && str(values[i][3]) !== '취소') return i + 2;
  }
  return -1;
}

function log(no, act, before, after, by) {
  sheet(SHEET_LOG).appendRow([now(), no, act, before, after, by || '본인']);
}

function isPastDeadline() {
  var dl = conf('신청마감일시', '');
  if (!dl) return false;
  var t = new Date(String(dl).replace(' ', 'T'));
  if (isNaN(t.getTime())) return false;
  return new Date().getTime() > t.getTime();
}

/* ==========================================================================
   API — 신청자
   ========================================================================== */

function apiConfig() {
  return { ok: true, cohorts: getCohorts(), deadline: conf('신청마감일시', '') };
}

function apiVerify(p) {
  var no = str(p.no), name = str(p.name);
  if (!/^\d{6}$/.test(no)) return { ok: false, error: '사번은 숫자 6자리로 입력해 주세요.' };
  if (!name) return { ok: false, error: '성명을 입력해 주세요.' };

  var hit = findRoster(no, name);
  if (!hit) {
    return { ok: false, error: '명단에 등록되어 있지 않습니다. 사번과 성명을 다시 확인하시거나 입학관리팀으로 문의해 주세요.' };
  }

  var my = null;
  var applies = readAll(SHEET_APPLY);
  for (var i = 0; i < applies.length; i++) {
    if (str(applies[i]['사번']) === no && str(applies[i]['상태']) !== '취소') {
      my = {
        cohort: str(applies[i]['차수ID']),
        status: str(applies[i]['상태']),
        at: str(applies[i]['신청일시'])
      };
      break;
    }
  }

  return {
    ok: true,
    token: hit.no,
    user: { no: hit.no, name: hit.name, unit: hit.unit },
    my: my,
    cohorts: getCohorts(),
    deadline: conf('신청마감일시', '')
  };
}

/**
 * 신청 — 정원 초과가 발생하지 않도록 스크립트 락으로 직렬화한다.
 * 좌석 수 확인과 기록이 하나의 임계 구역 안에서 이뤄지는 것이 핵심.
 */
function apiApply(p) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    return { ok: false, error: '신청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.' };
  }
  try {
    if (isPastDeadline()) {
      return { ok: false, error: '신청 기간이 종료되었습니다. 입학관리팀으로 문의해 주세요.' };
    }

    var user = rosterByNo(str(p.token));
    if (!user) return { ok: false, error: '인증이 만료되었습니다. 처음부터 다시 진행해 주세요.' };

    var cohorts = getCohorts();
    var target = null;
    for (var i = 0; i < cohorts.length; i++) {
      if (cohorts[i].id === str(p.cohort)) { target = cohorts[i]; break; }
    }
    if (!target) return { ok: false, error: '존재하지 않는 차수입니다.' };

    var full = target.closed || target.taken >= target.cap;
    var status = full ? '대기' : '확정';
    var stamp = now();

    var sh = sheet(SHEET_APPLY);
    var row = findApplyRow(user.no);

    if (row > 0) {
      var before = str(sh.getRange(row, 3).getValue());
      var beforeStatus = str(sh.getRange(row, 4).getValue());
      sh.getRange(row, 1, 1, 6).setValues([[user.no, user.name, target.id, status, stamp, '']]);
      log(user.no, '차수변경', before + '/' + beforeStatus, target.id + '/' + status, '본인');
      // 이전 차수에서 확정이 빠졌다면 대기 1순위를 승급
      if (beforeStatus === '확정' && before !== target.id) promoteFirstWaiting(before);
    } else {
      sh.appendRow([user.no, user.name, target.id, status, stamp, '']);
      log(user.no, '신청', '', target.id + '/' + status, '본인');
    }

    return {
      ok: true,
      my: { cohort: target.id, status: status, at: stamp },
      cohorts: getCohorts()
    };
  } finally {
    lock.releaseLock();
  }
}

function apiCancel(p) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    return { ok: false, error: '잠시 후 다시 시도해 주세요.' };
  }
  try {
    var no = str(p.token);
    var sh = sheet(SHEET_APPLY);
    var row = findApplyRow(no);
    if (row > 0) {
      var cohortId = str(sh.getRange(row, 3).getValue());
      var status = str(sh.getRange(row, 4).getValue());
      sh.deleteRow(row);
      log(no, '취소', cohortId + '/' + status, '', '본인');
      if (status === '확정') promoteFirstWaiting(cohortId);
    }
    return { ok: true, cohorts: getCohorts() };
  } finally {
    lock.releaseLock();
  }
}

/** 해당 차수의 대기 1순위(가장 먼저 신청한 사람)를 확정으로 승급 */
function promoteFirstWaiting(cohortId) {
  if (!cohortId) return;
  var sh = sheet(SHEET_APPLY);
  var last = sh.getLastRow();
  if (last < 2) return;

  var values = sh.getRange(2, 1, last - 1, 5).getValues();
  var bestRow = -1, bestAt = null;
  for (var i = 0; i < values.length; i++) {
    if (str(values[i][2]) !== str(cohortId)) continue;
    if (str(values[i][3]) !== '대기') continue;
    var at = str(values[i][4]);
    if (bestAt === null || at < bestAt) { bestAt = at; bestRow = i + 2; }
  }
  if (bestRow > 0) {
    sh.getRange(bestRow, 4).setValue('확정');
    log(str(sh.getRange(bestRow, 1).getValue()), '대기승급', '대기', '확정', '시스템');
  }
}

/* ==========================================================================
   API — 관리자
   ========================================================================== */

function adminToken() {
  return Utilities.base64Encode(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      'uou-admin|' + conf('관리자비밀번호', '')
    )
  );
}

function requireAdmin(p) {
  if (str(p.token) !== adminToken()) throw new Error('관리자 인증이 필요합니다. 다시 로그인해 주세요.');
}

function apiAdminLogin(p) {
  var pw = conf('관리자비밀번호', '');
  if (!pw) return { ok: false, error: '설정 시트에 관리자비밀번호가 지정되어 있지 않습니다.' };
  if (str(p.pw) !== pw) return { ok: false, error: '비밀번호가 올바르지 않습니다.' };
  return { ok: true, token: adminToken() };
}

function apiAdminData(p) {
  requireAdmin(p);

  var applies = readAll(SHEET_APPLY).filter(function (a) { return str(a['상태']) !== '취소'; });
  var roster = readAll(SHEET_ROSTER);
  var appliedNos = {};
  applies.forEach(function (a) { appliedNos[str(a['사번'])] = true; });

  var applicants = applies.map(function (a) {
    var r = rosterByNo(str(a['사번']));
    return {
      no: str(a['사번']),
      name: str(a['성명']) || (r ? r.name : ''),
      unit: r ? r.unit : '',
      cohort: str(a['차수ID']),
      status: str(a['상태']),
      at: str(a['신청일시'])
    };
  });

  var pending = roster
    .filter(function (r) { return !appliedNos[str(r['사번'])]; })
    .map(function (r) {
      return {
        no: str(r['사번']),
        name: str(r['성명']),
        unit: str(r['평가모집단위']),
        college: str(r['단과대학']),
        kind: str(r['구분'])
      };
    });

  return {
    ok: true,
    cohorts: getCohorts(),
    applicants: applicants,
    pending: pending,
    total: Number(conf('총원', roster.length)) || roster.length,
    deadline: conf('신청마감일시', '')
  };
}

function apiAdminUpdate(p) {
  requireAdmin(p);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) return { ok: false, error: '잠시 후 다시 시도해 주세요.' };
  try {
    var no = str(p.no);
    var sh = sheet(SHEET_APPLY);
    var row = findApplyRow(no);
    if (row < 0) return { ok: false, error: '신청 내역을 찾을 수 없습니다.' };

    var beforeCohort = str(sh.getRange(row, 3).getValue());
    var beforeStatus = str(sh.getRange(row, 4).getValue());

    if (str(p.status) === '취소') {
      sh.deleteRow(row);
      log(no, '관리자취소', beforeCohort + '/' + beforeStatus, '', '관리자');
      if (beforeStatus === '확정') promoteFirstWaiting(beforeCohort);
      return { ok: true };
    }

    if (p.cohort && str(p.cohort) !== beforeCohort) {
      sh.getRange(row, 3).setValue(str(p.cohort));
      log(no, '관리자차수변경', beforeCohort, str(p.cohort), '관리자');
      if (beforeStatus === '확정') promoteFirstWaiting(beforeCohort);
    }
    if (p.status && str(p.status) !== beforeStatus) {
      sh.getRange(row, 4).setValue(str(p.status));
      log(no, '관리자상태변경', beforeStatus, str(p.status), '관리자');
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function apiAdminConfig(p) {
  requireAdmin(p);

  var sh = sheet(SHEET_COHORT);
  var last = sh.getLastRow();
  var current = getCohorts();

  (p.cohorts || []).forEach(function (row) {
    var taken = 0;
    current.forEach(function (c) { if (c.id === str(row.id)) taken = c.taken; });
    if (row.cap && Number(row.cap) < taken) {
      throw new Error(str(row.id) + ' 정원은 현재 확정 인원(' + taken + '명)보다 작을 수 없습니다.');
    }
    for (var r = 2; r <= last; r++) {
      if (str(sh.getRange(r, 1).getValue()) !== str(row.id)) continue;
      if (row.d1) sh.getRange(r, 3).setValue(row.d1);
      if (row.d2) sh.getRange(r, 4).setValue(row.d2);
      if (row.cap) sh.getRange(r, 5).setValue(Number(row.cap));
      sh.getRange(r, 6).setValue(row.closed ? 'Y' : 'N');
      break;
    }
  });

  if (p.deadline) setConf('신청마감일시', str(p.deadline));
  log('-', '설정변경', '', '차수/정원/마감', '관리자');
  return { ok: true };
}

/* ==========================================================================
   설치 도우미 — 스크립트 편집기에서 1회 실행하면 필요한 시트를 만들어 준다.
   ========================================================================== */

function setupSheets() {
  var book = ss();
  var specs = [
    [SHEET_ROSTER, ['사번', '성명', '평가모집단위', '단과대학', '학부', '구분']],
    [SHEET_COHORT, ['차수ID', '차수명', '1일차', '2일차', '정원', '마감여부']],
    [SHEET_APPLY,  ['사번', '성명', '차수ID', '상태', '신청일시', '비고']],
    [SHEET_LOG,    ['일시', '사번', '행위', '변경전', '변경후', '처리자']],
    [SHEET_CONF,   ['키', '값']]
  ];

  specs.forEach(function (spec) {
    var sh = book.getSheetByName(spec[0]);
    if (!sh) sh = book.insertSheet(spec[0]);
    if (sh.getLastRow() === 0) {
      sh.appendRow(spec[1]);
      sh.getRange(1, 1, 1, spec[1].length).setFontWeight('bold').setBackground('#F7F8F8');
      sh.setFrozenRows(1);
    }
  });

  var confSh = book.getSheetByName(SHEET_CONF);
  if (confSh.getLastRow() < 2) {
    confSh.appendRow(['관리자비밀번호', 'CHANGE_ME_2027']);
    confSh.appendRow(['신청마감일시', '2026-08-22T18:00']);
    confSh.appendRow(['총원', 120]);
  }

  var cohortSh = book.getSheetByName(SHEET_COHORT);
  if (cohortSh.getLastRow() < 2) {
    cohortSh.appendRow(['C1', '1차', '2026-08-24', '2026-08-25', 30, 'N']);
    cohortSh.appendRow(['C2', '2차', '2026-08-26', '2026-08-27', 30, 'N']);
    cohortSh.appendRow(['C3', '3차', '2026-08-28', '2026-08-31', 30, 'N']);
    cohortSh.appendRow(['C4', '4차', '2026-09-01', '2026-09-02', 30, 'N']);
  }

  Logger.log('시트 준비 완료. 명단 시트에 대상자 명단을 붙여넣으세요.');
}
