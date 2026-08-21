/* ==========================================================================
   공통 API 계층
   - config.json 의 apiUrl 이 설정되어 있으면 Google Apps Script 백엔드를 호출
   - 비어 있으면 시연 모드(localStorage 기반 더미 백엔드)로 동작
   ========================================================================== */
(function (global) {
  "use strict";

  var CFG = null;
  var DEMO_KEY = "uou-mock-eval-demo-v1";

  /* --- 설정 ------------------------------------------------------------- */
  function loadConfig() {
    if (CFG) return Promise.resolve(CFG);
    return fetch("config.json", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (c) { CFG = c; return c; })
      .catch(function () {
        CFG = { apiUrl: "", deadlineText: "", venue: "", contact: "" };
        return CFG;
      });
  }

  function isDemo() { return !CFG || !CFG.apiUrl; }

  /* --- 호출 ------------------------------------------------------------- */
  function call(action, payload) {
    return loadConfig().then(function (cfg) {
      if (!cfg.apiUrl) return Demo.handle(action, payload || {});

      // CORS 프리플라이트를 피하기 위해 text/plain 으로 JSON 문자열 전송.
      // Apps Script 는 e.postData.contents 로 원문을 그대로 받는다.
      var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
      return fetch(cfg.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: body,
        redirect: "follow"
      })
        .then(function (r) {
          if (!r.ok) throw new Error("서버 응답 오류 (" + r.status + ")");
          return r.json();
        })
        .then(function (res) {
          if (res && res.ok === false) throw new Error(res.error || "요청을 처리하지 못했습니다.");
          return res;
        })
        .catch(function (err) {
          if (err instanceof TypeError) {
            throw new Error("서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.");
          }
          throw err;
        });
    });
  }

  /* ======================================================================
     시연 모드 더미 백엔드 (localStorage)
     ====================================================================== */
  var Demo = {
    // 시연 전용 가상 데이터. 실제 명단과 무관하며 저장소에 개인정보를 두지 않기 위한 것.
    seedRoster: [
      { no: "900001", name: "홍길동", unit: "01 자율전공학부", college: "아산아너스칼리지", kind: "위촉" },
      { no: "900002", name: "김철수", unit: "02 미래모빌리티공학부", college: "미래엔지니어링융합대학", kind: "위촉" },
      { no: "900003", name: "이영희", unit: "03 에너지화학공학부", college: "미래엔지니어링융합대학", kind: "위촉" },
      { no: "900004", name: "박민수", unit: "04 신소재·반도체융합학부", college: "미래엔지니어링융합대학", kind: "위촉" },
      { no: "900005", name: "최지은", unit: "05 전기전자융합학부", college: "미래엔지니어링융합대학", kind: "위촉" },
      { no: "900006", name: "정대현", unit: "06 ICT융합학부", college: "미래엔지니어링융합대학", kind: "위촉" },
      { no: "900007", name: "강수진", unit: "07 바이오메디컬헬스", college: "미래엔지니어링융합대학", kind: "위촉" },
      { no: "900008", name: "윤태호", unit: "08 건축도시환경학부", college: "스마트도시융합대학", kind: "위촉" },
      { no: "900009", name: "임하영", unit: "09 공공인재학부", college: "경영·공공정책대학", kind: "위촉" },
      { no: "900010", name: "조성훈", unit: "10 경영경제융합학부", college: "경영·공공정책대학", kind: "위촉" },
      { no: "900011", name: "한소미", unit: "11 글로벌인문학부", college: "인문예술대학", kind: "위촉" },
      { no: "900012", name: "오준석", unit: "12 간호학과", college: "의과대학", kind: "위촉" },
      { no: "900013", name: "서다인", unit: "01 자율전공학부", college: "인문예술대학", kind: "전임" }
    ],
    seedCohorts: [
      { id: "C1", name: "1차", d1: "2026-08-24", d2: "2026-08-25", cap: 30, closed: false, taken: 29, wait: 0 },
      { id: "C2", name: "2차", d1: "2026-08-26", d2: "2026-08-27", cap: 30, closed: false, taken: 23, wait: 0 },
      { id: "C3", name: "3차", d1: "2026-08-28", d2: "2026-08-31", cap: 30, closed: false, taken: 8, wait: 0 },
      { id: "C4", name: "4차", d1: "2026-09-01", d2: "2026-09-02", cap: 30, closed: false, taken: 0, wait: 0 }
    ],

    load: function () {
      try {
        var raw = localStorage.getItem(DEMO_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* 저장소 사용 불가 시 초기 상태 */ }
      var st = {
        roster: Demo.seedRoster,
        cohorts: Demo.seedCohorts,
        apps: [
          { no: "900001", name: "홍길동", unit: "01 자율전공학부", cohort: "C1", status: "확정", at: "2026-08-21 09:12:04" },
          { no: "900006", name: "정대현", unit: "06 ICT융합학부", cohort: "C1", status: "확정", at: "2026-08-21 09:31:52" },
          { no: "900002", name: "김철수", unit: "02 미래모빌리티공학부", cohort: "C2", status: "확정", at: "2026-08-21 10:02:11" },
          { no: "900012", name: "오준석", unit: "12 간호학과", cohort: "C3", status: "확정", at: "2026-08-21 11:20:39" }
        ],
        total: 120,
        deadline: "2026-08-22T18:00",
        pw: "demo"
      };
      Demo.save(st);
      return st;
    },
    save: function (st) {
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(st)); } catch (e) { /* noop */ }
    },

    /* 확정 인원은 신청 배열에서 계산 (seed taken 은 기준선) */
    counts: function (st, id) {
      var base = Demo.seedCohorts.filter(function (c) { return c.id === id; })[0];
      var seedTaken = base ? base.taken : 0;
      var seedNames = st.apps.filter(function (a) { return a.cohort === id && a.status === "확정" && a.at.indexOf("2026-08-21") === 0; }).length;
      var live = st.apps.filter(function (a) { return a.cohort === id && a.status === "확정"; }).length;
      var taken = seedTaken - seedNames + live;
      var wait = st.apps.filter(function (a) { return a.cohort === id && a.status === "대기"; }).length;
      return { taken: Math.max(0, taken), wait: wait };
    },

    cohortView: function (st) {
      return st.cohorts.map(function (c) {
        var n = Demo.counts(st, c.id);
        return Object.assign({}, c, { taken: n.taken, wait: n.wait });
      });
    },

    handle: function (action, p) {
      var st = Demo.load();
      var delay = function (v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 220); }); };
      var out;

      switch (action) {
        case "config":
          out = { ok: true, cohorts: Demo.cohortView(st), deadline: st.deadline, demo: true };
          break;

        case "verify": {
          var hit = st.roster.filter(function (r) {
            return r.no === String(p.no || "").trim() && r.name === String(p.name || "").trim();
          })[0];
          if (!hit) { out = { ok: false, error: "명단에 등록되어 있지 않습니다. 사번과 성명을 다시 확인하시거나 입학관리팀으로 문의해 주세요." }; break; }
          var mine = st.apps.filter(function (a) { return a.no === hit.no && a.status !== "취소"; })[0];
          out = {
            ok: true, token: hit.no,
            user: { no: hit.no, name: hit.name, unit: hit.unit },
            my: mine ? { cohort: mine.cohort, status: mine.status, at: mine.at } : null,
            cohorts: Demo.cohortView(st), deadline: st.deadline
          };
          break;
        }

        case "apply": {
          var c = Demo.cohortView(st).filter(function (x) { return x.id === p.cohort; })[0];
          if (!c) { out = { ok: false, error: "존재하지 않는 차수입니다." }; break; }
          var u = st.roster.filter(function (r) { return r.no === p.token; })[0];
          if (!u) { out = { ok: false, error: "인증이 만료되었습니다. 처음부터 다시 진행해 주세요." }; break; }
          st.apps = st.apps.filter(function (a) { return a.no !== p.token; });
          var full = c.closed || c.taken >= c.cap;
          var rec = {
            no: u.no, name: u.name, unit: u.unit, cohort: p.cohort,
            status: full ? "대기" : "확정", at: Demo.now()
          };
          st.apps.push(rec);
          Demo.save(st);
          out = { ok: true, my: { cohort: rec.cohort, status: rec.status, at: rec.at }, cohorts: Demo.cohortView(st) };
          break;
        }

        case "cancel": {
          var target = st.apps.filter(function (a) { return a.no === p.token; })[0];
          if (target) {
            var cid = target.cohort, wasConfirmed = target.status === "확정";
            st.apps = st.apps.filter(function (a) { return a.no !== p.token; });
            if (wasConfirmed) {
              var next = st.apps.filter(function (a) { return a.cohort === cid && a.status === "대기"; })[0];
              if (next) next.status = "확정";
            }
            Demo.save(st);
          }
          out = { ok: true, cohorts: Demo.cohortView(st) };
          break;
        }

        case "adminLogin":
          if (String(p.pw) !== st.pw) { out = { ok: false, error: "비밀번호가 올바르지 않습니다. (시연 모드 비밀번호: demo)" }; break; }
          out = { ok: true, token: "demo-admin" };
          break;

        case "adminData": {
          var applied = st.apps.filter(function (a) { return a.status !== "취소"; });
          var appliedNos = applied.map(function (a) { return a.no; });
          out = {
            ok: true,
            cohorts: Demo.cohortView(st),
            applicants: applied,
            pending: st.roster.filter(function (r) { return appliedNos.indexOf(r.no) === -1; }),
            total: st.total,
            deadline: st.deadline,
            demo: true
          };
          break;
        }

        case "adminUpdate": {
          var a2 = st.apps.filter(function (a) { return a.no === p.no; })[0];
          if (a2) {
            if (p.cohort) a2.cohort = p.cohort;
            if (p.status) a2.status = p.status;
            if (p.status === "취소") st.apps = st.apps.filter(function (x) { return x.no !== p.no; });
            Demo.save(st);
          }
          out = { ok: true };
          break;
        }

        case "adminConfig": {
          (p.cohorts || []).forEach(function (row) {
            var c3 = st.cohorts.filter(function (x) { return x.id === row.id; })[0];
            if (!c3) return;
            if (row.d1) c3.d1 = row.d1;
            if (row.d2) c3.d2 = row.d2;
            if (row.cap) c3.cap = row.cap;
            if (typeof row.closed === "boolean") c3.closed = row.closed;
          });
          if (p.deadline) st.deadline = p.deadline;
          Demo.save(st);
          out = { ok: true };
          break;
        }

        default:
          out = { ok: false, error: "알 수 없는 요청입니다: " + action };
      }

      if (out.ok === false) return delay(null).then(function () { throw new Error(out.error); });
      return delay(out);
    },

    now: function () {
      var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
        p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    }
  };

  /* --- 공용 유틸 --------------------------------------------------------- */
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];

  function fmtDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return Number(p[1]) + "." + Number(p[2]) + "(" + DOW[d.getDay()] + ")";
  }

  function fmtDateFull(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return p[0] + ". " + Number(p[1]) + ". " + Number(p[2]) + ".(" + DOW[d.getDay()] + ")";
  }

  function fmtRange(a, b) {
    var pa = String(a).split("-"), pb = String(b).split("-");
    if (pa.length !== 3 || pb.length !== 3) return a + " ~ " + b;
    return pa[1] + "." + pa[2] + " ~ " + pb[1] + "." + pb[2];
  }

  function fmtDeadline(v) {
    if (!v) return "—";
    var s = String(v).replace("T", " ");
    var p = s.split(" ");
    if (p.length < 2) return s;
    return fmtDateFull(p[0]) + " " + p[1].slice(0, 5);
  }

  function mask(n) {
    if (!n) return "";
    if (n.length <= 2) return n[0] + "*";
    return n[0] + "*".repeat(n.length - 2) + n[n.length - 1];
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function downloadCsv(filename, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (cell) {
        var s = String(cell == null ? "" : cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
    }).join("\r\n");
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.API = {
    loadConfig: loadConfig, call: call, isDemo: isDemo,
    fmtDate: fmtDate, fmtDateFull: fmtDateFull, fmtRange: fmtRange, fmtDeadline: fmtDeadline,
    mask: mask, esc: esc, downloadCsv: downloadCsv, now: Demo.now
  };
})(window);
