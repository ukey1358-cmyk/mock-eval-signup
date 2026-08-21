/* ==========================================================================
   신청자 화면 — 본인 확인 → 차수 선택 → 신청 완료
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var state = { step: "verify", token: null, user: null, my: null, cohorts: [], selected: null, deadline: "", requireName: false };

  /* --- 화면 전환 --------------------------------------------------------- */
  function render() {
    $("viewVerify").hidden = state.step !== "verify";
    $("viewSelect").hidden = state.step !== "select";
    $("viewDone").hidden = state.step !== "done";

    var order = { verify: 0, select: 1, done: 2 };
    var cur = order[state.step];
    Array.prototype.forEach.call($("steps").children, function (el, i) {
      el.classList.toggle("is-on", i <= cur);
    });

    $("deadlineText").textContent = API.fmtDeadline(state.deadline);
    if (state.step === "select") renderCohorts();
    if (state.step === "done") renderDone();
  }

  function showError(id, msg) {
    var el = $(id);
    if (!msg) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false; el.textContent = msg;
  }

  function busy(btn, on, label) {
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.innerHTML = '<span class="spinner"></span>처리 중'; }
    else { btn.textContent = label || btn.dataset.label || btn.textContent; }
  }

  /* --- 1단계 · 본인 확인 -------------------------------------------------- */
  $("verifyForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var no = $("empNo").value.trim(), name = $("empName").value.trim();
    showError("verifyError", "");
    if (!/^\d{6}$/.test(no)) { showError("verifyError", "사번은 숫자 6자리로 입력해 주세요."); return; }
    if (state.requireName && !name) { showError("verifyError", "성명을 입력해 주세요."); return; }

    var btn = $("verifyBtn");
    busy(btn, true);
    API.call("verify", { no: no, name: name })
      .then(function (res) {
        state.token = res.token;
        state.user = res.user;
        state.my = res.my;
        state.cohorts = res.cohorts || [];
        if (res.deadline) state.deadline = res.deadline;
        state.selected = res.my ? res.my.cohort : null;
        state.step = res.my ? "done" : "select";
        render();
      })
      .catch(function (err) { showError("verifyError", err.message); })
      .finally(function () { busy(btn, false, "본인 확인"); });
  });

  /* --- 2단계 · 차수 선택 -------------------------------------------------- */
  function renderCohorts() {
    $("selectTitle").textContent = API.mask(state.user.name) + " 님, 참석 차수를 선택해 주세요";
    $("userUnit").textContent = state.user.unit || "";

    var wrap = $("cohortList");
    wrap.innerHTML = "";

    state.cohorts.forEach(function (c) {
      var remain = Math.max(0, c.cap - c.taken);
      var full = remain === 0 || c.closed;
      var mine = state.my && state.my.cohort === c.id;
      var sel = state.selected === c.id;
      var pct = Math.round((Math.min(c.taken, c.cap) / c.cap) * 100);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cohort" + (sel ? " is-selected" : "") + (full ? " is-full" : "");
      btn.disabled = full && !mine;
      btn.innerHTML =
        '<div class="cohort__top">' +
          '<span class="cohort__name">' + API.esc(c.name) + '</span>' +
          '<span class="badge badge--' + (full ? "info" : mine ? "accent" : "success") + '">' +
            (full ? "마감" : mine ? "신청 중" : "신청 가능") + '</span>' +
        '</div>' +
        '<div class="cohort__dates">' +
          '<span>1일차 ' + API.fmtDate(c.d1) + ' 09:00~18:00</span>' +
          '<span>2일차 ' + API.fmtDate(c.d2) + ' 13:00~17:00</span>' +
        '</div>' +
        '<div class="cohort__seats">' +
          '<div class="meter"><div class="meter__fill" style="width:' + pct + '%"></div></div>' +
          '<span class="cohort__seattext">' +
            (full ? (c.wait > 0 ? "정원 마감 · 대기 " + c.wait + "명" : "정원 마감")
                  : "잔여 " + remain + " / " + c.cap) +
          '</span>' +
        '</div>';

      btn.addEventListener("click", function () {
        state.selected = c.id;
        renderCohorts();
      });
      wrap.appendChild(btn);
    });

    var sc = state.cohorts.filter(function (x) { return x.id === state.selected; })[0];
    var selFull = sc ? (sc.closed || sc.cap - sc.taken <= 0) : false;
    var sb = $("submitBtn");
    sb.disabled = !state.selected;
    sb.textContent = !state.selected ? "차수를 선택하세요" : selFull ? "대기 등록" : "이 차수로 신청";
  }

  $("submitBtn").addEventListener("click", function () {
    if (!state.selected) return;
    showError("selectError", "");
    var btn = $("submitBtn");
    busy(btn, true);
    API.call("apply", { token: state.token, cohort: state.selected })
      .then(function (res) {
        state.my = res.my;
        state.cohorts = res.cohorts || state.cohorts;
        state.step = "done";
        render();
      })
      .catch(function (err) { showError("selectError", err.message); })
      .finally(function () { busy(btn, false); renderCohorts(); });
  });

  $("backBtn").addEventListener("click", reset);

  /* --- 3단계 · 완료 ------------------------------------------------------- */
  function renderDone() {
    var my = state.my || {};
    var c = state.cohorts.filter(function (x) { return x.id === my.cohort; })[0] || {};
    var waiting = my.status === "대기";

    $("doneMark").textContent = waiting ? "!" : "✓";
    $("doneMark").className = "done__mark" + (waiting ? " done__mark--wait" : "");
    $("doneTitle").textContent = waiting ? "대기 등록되었습니다" : "신청이 확정되었습니다";

    var rows = [
      ["신청 차수", (c.name || "") + " (" + API.fmtRange(c.d1, c.d2) + ")"],
      ["1일차", API.fmtDateFull(c.d1) + " 09:00 ~ 18:00 · 1~8차시"],
      ["2일차", API.fmtDateFull(c.d2) + " 13:00 ~ 17:00 · 9~12차시"],
      ["장소", "울산대학교 22호관 401호 전산교육실"],
      ["인정 시수", "12단위 (1단위 = 교육 50분 + 휴식 10분)"],
      ["신청자", API.mask(state.user.name) + " · " + (state.user.unit || "")],
      ["상태", (my.status || "") + (my.at ? " · " + my.at + " 접수" : "")]
    ];

    $("receipt").innerHTML = rows.map(function (r) {
      return '<div class="receipt__row"><span class="receipt__k">' + API.esc(r[0]) +
        '</span><span class="receipt__v">' + API.esc(r[1]) + '</span></div>';
    }).join("");
  }

  $("changeBtn").addEventListener("click", function () {
    state.selected = state.my ? state.my.cohort : null;
    state.step = "select";
    showError("doneError", "");
    render();
  });

  $("cancelBtn").addEventListener("click", function () {
    if (!confirm("신청을 취소하시겠습니까?\n취소 후에는 잔여석이 있는 차수로 다시 신청해야 합니다.")) return;
    showError("doneError", "");
    var btn = $("cancelBtn");
    busy(btn, true);
    API.call("cancel", { token: state.token })
      .then(function (res) {
        state.my = null;
        state.selected = null;
        state.cohorts = res.cohorts || state.cohorts;
        state.step = "select";
        render();
      })
      .catch(function (err) { showError("doneError", err.message); })
      .finally(function () { busy(btn, false, "신청 취소"); });
  });

  $("logoutBtn").addEventListener("click", reset);

  function reset() {
    state.step = "verify";
    state.token = null; state.user = null; state.my = null; state.selected = null;
    $("empNo").value = ""; $("empName").value = "";
    showError("verifyError", ""); showError("selectError", ""); showError("doneError", "");
    render();
  }

  /* --- 초기화 ------------------------------------------------------------ */
  API.loadConfig().then(function (cfg) {
    state.deadline = cfg.deadlineText || "";
    state.requireName = cfg.requireName === true;
    if (state.requireName) {
      $("nameField").hidden = false;
      $("empName").setAttribute("required", "required");
      $("verifyNote").textContent = "명단에 없는 경우 입학관리팀(052-259-2058)으로 문의해 주세요. " +
        "입력한 사번과 성명은 비공개 명단과 서버에서 대조되며 화면에 명단이 노출되지 않습니다.";
    }
    if (API.isDemo()) {
      $("modeTag").hidden = false;
      $("demoHint").hidden = false;
      $("demoHint").innerHTML = "백엔드 미연결 — 시연 모드로 동작합니다. 예시 사번 " +
        '<span class="mono">900001</span>' + (state.requireName ? ' / 성명 <span class="mono">홍길동</span>' : "");
    }
    return API.call("config", {});
  })
    .then(function (res) {
      state.cohorts = res.cohorts || [];
      if (res.deadline) state.deadline = res.deadline;
      render();
    })
    .catch(function () { render(); });
})();
