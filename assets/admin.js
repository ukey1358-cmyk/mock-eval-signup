/* ==========================================================================
   관리자 화면 — 현황 / 미신청자 / 신청자 관리 / 차수 설정
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var state = { token: null, tab: "status", cohorts: [], applicants: [], pending: [], total: 120, deadline: "" };

  /* --- 로그인 ------------------------------------------------------------ */
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = $("adminPw").value;
    $("loginError").hidden = true;
    API.call("adminLogin", { pw: pw })
      .then(function (res) {
        state.token = res.token;
        try { sessionStorage.setItem("uou-admin-token", res.token); } catch (err) { /* noop */ }
        $("viewLogin").hidden = true;
        $("viewAdmin").hidden = false;
        return load();
      })
      .catch(function (err) {
        $("loginError").hidden = false;
        $("loginError").textContent = err.message;
      });
  });

  /* --- 데이터 로드 -------------------------------------------------------- */
  function load() {
    return API.call("adminData", { token: state.token })
      .then(function (res) {
        state.cohorts = res.cohorts || [];
        state.applicants = res.applicants || [];
        state.pending = res.pending || [];
        state.total = res.total || 120;
        state.deadline = res.deadline || "";
        $("lastSync").textContent = API.now();
        renderAll();
      })
      .catch(function (err) { alert(err.message); });
  }

  $("refreshBtn").addEventListener("click", load);

  /* --- 탭 ---------------------------------------------------------------- */
  Array.prototype.forEach.call($("tabs").children, function (btn) {
    btn.addEventListener("click", function () {
      state.tab = btn.dataset.tab;
      Array.prototype.forEach.call($("tabs").children, function (b) {
        b.classList.toggle("is-on", b.dataset.tab === state.tab);
      });
      ["status", "pending", "manage", "config"].forEach(function (t) {
        $("panel" + t.charAt(0).toUpperCase() + t.slice(1)).hidden = t !== state.tab;
      });
    });
  });

  /* --- 렌더 -------------------------------------------------------------- */
  function renderAll() { renderStatus(); renderPending(); renderManage(); renderConfig(); }

  function totals() {
    var taken = state.cohorts.reduce(function (a, c) { return a + c.taken; }, 0);
    var wait = state.cohorts.reduce(function (a, c) { return a + c.wait; }, 0);
    return { taken: taken, wait: wait };
  }

  function renderStatus() {
    var t = totals();
    var pct = state.total ? Math.round((t.taken / state.total) * 100) : 0;
    var cards = [
      { label: "전체 신청", value: t.taken + " / " + state.total, sub: pct + "% 접수", cls: "" },
      { label: "확정", value: String(t.taken), sub: "좌석 차감 완료", cls: "stat--green" },
      { label: "대기", value: String(t.wait), sub: "취소 시 자동 승급", cls: "stat--yellow" },
      { label: "미신청", value: String(Math.max(0, state.total - t.taken)), sub: "독촉 안내 대상", cls: "stat--danger" }
    ];
    $("stats").innerHTML = cards.map(function (c) {
      return '<div class="stat ' + c.cls + '">' +
        '<div class="stat__label">' + API.esc(c.label) + '</div>' +
        '<div class="stat__value">' + API.esc(c.value) + '</div>' +
        '<div class="stat__sub">' + API.esc(c.sub) + '</div></div>';
    }).join("");

    $("cohortRows").innerHTML = state.cohorts.map(function (c) {
      var remain = Math.max(0, c.cap - c.taken);
      var pct2 = Math.round((Math.min(c.taken, c.cap) / c.cap) * 100);
      var full = remain === 0 || c.closed;
      return '<div class="grid-row g-cohort">' +
        '<span class="strong">' + API.esc(c.name) + '</span>' +
        '<span class="mono subtle">' + API.fmtRange(c.d1, c.d2) + '</span>' +
        '<span>' + c.taken + ' / ' + c.cap + '</span>' +
        '<span>' + c.wait + '</span>' +
        '<span class="' + (full ? "seat-full" : "seat-ok") + '">' + (full ? "마감" : remain + "석") + '</span>' +
        '<div class="fillcell"><div class="meter"><div class="meter__fill" style="width:' + pct2 + '%' +
          (full ? ';background:var(--gray-400)' : '') + '"></div></div>' +
          '<span class="subtle">' + pct2 + '%</span></div>' +
        '</div>';
    }).join("");
  }

  function renderPending() {
    $("pendingCount").textContent = state.pending.length;
    $("pendingNote").textContent = "명단 " + state.total + "명 − 신청 " +
      state.applicants.length + "명. 마감일 이후 잔여자는 개별 보강 대상으로 분류됩니다.";
    $("pendingRows").innerHTML = state.pending.length
      ? state.pending.map(function (p) {
          return '<div class="grid-row g-pending">' +
            '<span class="mono">' + API.esc(p.no) + '</span>' +
            '<span class="medium">' + API.esc(p.name) + '</span>' +
            '<span>' + API.esc(p.unit) + '</span>' +
            '<span class="muted">' + API.esc(p.college || "") + '</span>' +
            '<span class="subtle">' + API.esc(p.kind || "") + '</span></div>';
        }).join("")
      : '<div class="center">미신청자가 없습니다. 전원 신청이 완료되었습니다.</div>';
  }

  function renderManage() {
    $("manageRows").innerHTML = state.applicants.length
      ? state.applicants.map(function (a) {
          var opts = state.cohorts.map(function (c) {
            return '<option value="' + c.id + '"' + (c.id === a.cohort ? " selected" : "") + '>' +
              API.esc(c.name) + " " + API.fmtRange(c.d1, c.d2) + '</option>';
          }).join("");
          var variant = a.status === "확정" ? "success" : a.status === "대기" ? "accent" : "info";
          return '<div class="grid-row g-manage">' +
            '<span class="mono">' + API.esc(a.no) + '</span>' +
            '<span class="medium">' + API.esc(a.name) + '</span>' +
            '<span>' + API.esc(a.unit) + '</span>' +
            '<select class="input input--sm" data-move="' + API.esc(a.no) + '">' + opts + '</select>' +
            '<span class="badge badge--' + variant + '">' + API.esc(a.status) + '</span>' +
            '<div class="actions">' +
              (a.status === "대기"
                ? '<button class="btn btn--sm btn--text" data-promote="' + API.esc(a.no) + '">승급</button>'
                : '<span class="subtle" style="padding:0 12px">—</span>') +
              '<button class="btn btn--sm btn--danger-text" data-cancel="' + API.esc(a.no) + '">취소</button>' +
            '</div></div>';
        }).join("")
      : '<div class="center">신청자가 없습니다.</div>';

    bind("[data-move]", "change", function (el) {
      return { no: el.dataset.move, cohort: el.value };
    });
    bind("[data-promote]", "click", function (el) {
      return { no: el.dataset.promote, status: "확정" };
    });
    bind("[data-cancel]", "click", function (el) {
      if (!confirm("이 신청을 취소하시겠습니까?")) return null;
      return { no: el.dataset.cancel, status: "취소" };
    });
  }

  function bind(sel, evt, build) {
    Array.prototype.forEach.call($("manageRows").querySelectorAll(sel), function (el) {
      el.addEventListener(evt, function () {
        var payload = build(el);
        if (!payload) { renderManage(); return; }
        API.call("adminUpdate", Object.assign({ token: state.token }, payload))
          .then(load)
          .catch(function (err) { alert(err.message); load(); });
      });
    });
  }

  function renderConfig() {
    $("configRows").innerHTML = state.cohorts.map(function (c) {
      return '<div class="grid-row g-config">' +
        '<span class="strong">' + API.esc(c.name) + '</span>' +
        '<input class="input input--sm" type="date" value="' + API.esc(c.d1) + '" data-cfg="d1" data-id="' + c.id + '">' +
        '<input class="input input--sm" type="date" value="' + API.esc(c.d2) + '" data-cfg="d2" data-id="' + c.id + '">' +
        '<input class="input input--sm" type="number" min="' + c.taken + '" max="200" value="' + c.cap + '" data-cfg="cap" data-id="' + c.id + '">' +
        '<span>' + c.taken + '명</span>' +
        '<button class="toggle' + (c.closed ? " is-closed" : "") + '" data-toggle="' + c.id + '">' +
          (c.closed ? "마감" : "진행") + '</button></div>';
    }).join("");

    Array.prototype.forEach.call($("configRows").querySelectorAll("[data-toggle]"), function (btn) {
      btn.addEventListener("click", function () {
        var c = state.cohorts.filter(function (x) { return x.id === btn.dataset.toggle; })[0];
        if (!c) return;
        c.closed = !c.closed;
        renderConfig();
      });
    });

    if (state.deadline) $("deadlineInput").value = state.deadline.slice(0, 16);
  }

  $("saveConfig").addEventListener("click", function () {
    $("configError").hidden = true;
    var rows = [], bad = null;
    state.cohorts.forEach(function (c) {
      var get = function (k) {
        var el = $("configRows").querySelector('[data-cfg="' + k + '"][data-id="' + c.id + '"]');
        return el ? el.value : null;
      };
      var cap = parseInt(get("cap"), 10);
      if (isNaN(cap) || cap < c.taken) { bad = c.name + " 정원은 현재 확정 인원(" + c.taken + "명)보다 작을 수 없습니다."; }
      rows.push({ id: c.id, d1: get("d1"), d2: get("d2"), cap: cap, closed: c.closed });
    });
    if (bad) { $("configError").hidden = false; $("configError").textContent = bad; return; }

    API.call("adminConfig", { token: state.token, cohorts: rows, deadline: $("deadlineInput").value })
      .then(function () { alert("설정이 저장되었습니다."); return load(); })
      .catch(function (err) { $("configError").hidden = false; $("configError").textContent = err.message; });
  });

  /* --- 내보내기 ----------------------------------------------------------- */
  $("exportRoll").addEventListener("click", function () {
    var rows = [["차수", "1일차", "2일차", "사번", "성명", "평가모집단위", "상태"]];
    state.cohorts.forEach(function (c) {
      state.applicants
        .filter(function (a) { return a.cohort === c.id; })
        .sort(function (x, y) { return String(x.unit).localeCompare(String(y.unit), "ko"); })
        .forEach(function (a) {
          rows.push([c.name, c.d1, c.d2, a.no, a.name, a.unit, a.status]);
        });
    });
    API.downloadCsv("모의평가교육_차수별출석부.csv", rows);
  });

  $("exportAll").addEventListener("click", function () {
    var rows = [["사번", "성명", "평가모집단위", "차수", "상태", "신청일시"]];
    state.applicants.forEach(function (a) {
      var c = state.cohorts.filter(function (x) { return x.id === a.cohort; })[0] || {};
      rows.push([a.no, a.name, a.unit, c.name || a.cohort, a.status, a.at || ""]);
    });
    API.downloadCsv("모의평가교육_전체신청현황.csv", rows);
  });

  $("exportMeal").addEventListener("click", function () {
    var rows = [["차수", "1일차", "2일차", "확정인원", "1일차 식대대상", "2일차 식대대상"]];
    state.cohorts.forEach(function (c) {
      rows.push([c.name, c.d1, c.d2, c.taken, c.taken, c.taken]);
    });
    var t = totals();
    rows.push(["합계", "", "", t.taken, t.taken, t.taken]);
    API.downloadCsv("모의평가교육_차수별인원집계.csv", rows);
  });

  $("copyPending").addEventListener("click", function () {
    var text = state.pending.map(function (p) {
      return [p.no, p.name, p.unit, p.college].join("\t");
    }).join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { alert("미신청자 " + state.pending.length + "명 명단을 복사했습니다."); })
        .catch(function () { alert("복사에 실패했습니다. CSV 내보내기를 이용해 주세요."); });
    } else {
      alert("이 브라우저는 복사를 지원하지 않습니다. CSV 내보내기를 이용해 주세요.");
    }
  });

  $("exportPending").addEventListener("click", function () {
    var rows = [["사번", "성명", "평가모집단위", "단과대학", "구분"]];
    state.pending.forEach(function (p) { rows.push([p.no, p.name, p.unit, p.college, p.kind]); });
    API.downloadCsv("모의평가교육_미신청자.csv", rows);
  });

  /* --- 초기화 ------------------------------------------------------------ */
  API.loadConfig().then(function () {
    if (API.isDemo()) $("modeTag").hidden = false;
    var saved = null;
    try { saved = sessionStorage.getItem("uou-admin-token"); } catch (e) { /* noop */ }
    if (saved) {
      state.token = saved;
      $("viewLogin").hidden = true;
      $("viewAdmin").hidden = false;
      load();
    }
  });
})();
