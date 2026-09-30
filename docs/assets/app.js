/* 주간 연구 대시보드 — 테마 토글 + 검색 필터 + 내 계획 + 앱 탭 (의존성 없음) */

(function () {
  "use strict";

  // ── 테마 ────────────────────────────────────────────────────────
  // 저장된 선택이 있으면 그것을, 없으면 OS 설정을 따른다(속성 없음 = OS 위임).
  var root = document.documentElement;
  var STORAGE_KEY = "dashboard-theme";

  function currentTheme() {
    var stamped = root.getAttribute("data-theme");
    if (stamped) return stamped;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function updateLabel(theme) {
    var button = document.querySelector(".theme-toggle");
    if (!button) return;
    button.textContent = theme === "dark" ? "라이트 모드" : "다크 모드";
    button.setAttribute("aria-label", theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환");
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    updateLabel(theme);
  }

  var media = window.matchMedia("(prefers-color-scheme: dark)");

  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") applyTheme(saved);
  } catch (e) { /* 프라이빗 모드 등에서 localStorage 차단 */ }

  document.addEventListener("click", function (event) {
    if (!event.target.closest(".theme-toggle")) return;
    var next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* 무시 */ }
  });

  // 저장된 선택이 없으면 data-theme 를 찍지 않는다. 찍어 버리면 그 시점의 OS
  // 설정으로 굳어져, 이후 OS 테마가 바뀌어도 페이지가 따라가지 않는다.
  updateLabel(currentTheme());
  media.addEventListener("change", function () {
    if (!root.getAttribute("data-theme")) updateLabel(currentTheme());
  });

  // ── 검색 ────────────────────────────────────────────────────────
  var input = document.querySelector("#search");
  if (!input) return;

  var items = Array.prototype.slice.call(document.querySelectorAll(".items > li"));
  var sections = Array.prototype.slice.call(document.querySelectorAll(".topic-card:not(.plan-card)"));
  var noResults = document.querySelector(".no-results");

  // 검색 대상 문자열을 미리 만들어 둔다 (입력마다 DOM 을 다시 읽지 않도록)
  items.forEach(function (li) {
    li.dataset.haystack = (li.textContent || "").toLowerCase();
  });

  function applyFilter(query) {
    var q = query.trim().toLowerCase();
    var anyVisible = false;

    items.forEach(function (li) {
      var hit = !q || li.dataset.haystack.indexOf(q) !== -1;
      li.hidden = !hit;
      if (hit) anyVisible = true;
    });

    // 항목이 모두 숨겨진 섹션은 섹션째 감춘다
    sections.forEach(function (section) {
      var visible = section.querySelectorAll(".items > li:not([hidden])").length;
      var hasItems = section.querySelectorAll(".items > li").length > 0;
      section.hidden = q ? visible === 0 : false;
      var counter = section.querySelector("h3 .count");
      if (counter && hasItems) {
        counter.textContent = q ? visible + "건 (검색)" : counter.dataset.total;
      }
    });

    if (noResults) noResults.style.display = q && !anyVisible ? "block" : "none";
  }

  // 필터 해제 시 원래 건수로 되돌리기 위해 초기값을 보관
  document.querySelectorAll("h3 .count").forEach(function (counter) {
    counter.dataset.total = counter.textContent;
  });

  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { applyFilter(input.value); }, 120);
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      input.value = "";
      applyFilter("");
    }
  });
})();


// ── 내 계획 ──────────────────────────────────────────────────────
// 기록은 이 기기의 localStorage 에만 저장한다. 저장이 막힌 환경(프라이빗 모드)에서는
// 메모리에서만 동작하고 새로고침하면 사라진다는 점을 요약줄에 알린다.
(function () {
  "use strict";

  var form = document.querySelector(".plan-form");
  if (!form) return;

  var KEY = "plan-items";
  var list = document.querySelector(".plan-list");
  var empty = document.querySelector(".plan-empty");
  var summary = document.querySelector(".plan-summary");
  var clearBtn = document.querySelector(".plan-clear");
  var persistent = true;
  var items = [];

  try {
    items = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(items)) items = [];
  } catch (e) {
    persistent = false;
    items = [];
  }

  function save() {
    if (!persistent) return;
    try { localStorage.setItem(KEY, JSON.stringify(items)); }
    catch (e) { persistent = false; }
  }

  function todayISO() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function daysLeft(due) {
    var a = Date.parse(todayISO() + "T00:00:00Z");
    var b = Date.parse(due + "T00:00:00Z");
    return Math.round((b - a) / 86400000);
  }

  function dueBadge(item) {
    if (!item.due) return null;
    var n = daysLeft(item.due);
    var span = document.createElement("span");
    span.className = "plan-due";
    span.title = item.due + " 마감";
    if (n < 0) {
      span.textContent = -n + "일 지남";
      span.classList.add("past");
    } else {
      span.textContent = n === 0 ? "D-day" : "D-" + n;
      if (n <= 3 && !item.done) span.classList.add("urgent");
    }
    return span;
  }

  function sorted() {
    return items.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
      if (!!a.due !== !!b.due) return a.due ? -1 : 1;
      return a.created - b.created;
    });
  }

  function draw() {
    list.textContent = "";
    sorted().forEach(function (item) {
      var li = document.createElement("li");
      if (item.done) li.className = "done";

      var box = document.createElement("input");
      box.type = "checkbox";
      box.checked = item.done;
      box.setAttribute("aria-label", item.text + (item.done ? " 완료 취소" : " 완료"));
      box.addEventListener("change", function () {
        item.done = box.checked;
        save();
        draw();
      });

      var text = document.createElement("span");
      text.className = "plan-text";
      text.textContent = item.text;

      var del = document.createElement("button");
      del.type = "button";
      del.className = "plan-del";
      del.textContent = "×";
      del.setAttribute("aria-label", item.text + " 삭제");
      del.addEventListener("click", function () {
        items = items.filter(function (x) { return x.id !== item.id; });
        save();
        draw();
      });

      li.appendChild(box);
      li.appendChild(text);
      var badge = dueBadge(item);
      if (badge) li.appendChild(badge);
      li.appendChild(del);
      list.appendChild(li);
    });

    var open = items.filter(function (x) { return !x.done; }).length;
    var done = items.length - open;
    empty.hidden = items.length > 0;
    clearBtn.hidden = done === 0;
    var parts = [];
    if (items.length) parts.push("남은 일 " + open + "개 · 완료 " + done + "개");
    if (!persistent) parts.push("저장이 막힌 브라우저라 새로고침하면 사라집니다");
    summary.textContent = parts.join(" · ");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = form.elements.text.value.trim();
    if (!text) return;
    items.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: text,
      due: form.elements.due.value || "",
      done: false,
      created: Date.now()
    });
    save();
    form.reset();
    form.elements.text.focus();
    draw();
  });

  clearBtn.addEventListener("click", function () {
    items = items.filter(function (x) { return !x.done; });
    save();
    draw();
  });

  // 다른 탭(또는 설치된 앱과 브라우저)에서 바꾼 내용을 따라간다
  window.addEventListener("storage", function (event) {
    if (event.key !== KEY) return;
    try { items = JSON.parse(event.newValue || "[]"); } catch (e) { return; }
    draw();
  });

  draw();
})();

// ── 하단 탭 바: 지금 보고 있는 섹션 표시 ─────────────────────────
(function () {
  "use strict";

  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tabbar a[data-tab]"));
  if (!tabs.length) return;

  // 화면 위쪽 35% 기준선을 지난 마지막 섹션을 현재 탭으로 본다. 맨 위(히어로)에서는 없음.
  function update() {
    var line = window.innerHeight * 0.35;
    var current = null;
    tabs.forEach(function (a) {
      var el = document.getElementById(a.dataset.tab);
      if (el && el.getBoundingClientRect().top < line) current = a.dataset.tab;
    });
    tabs.forEach(function (a) {
      var on = a.dataset.tab === current;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }

  var queued = false;
  window.addEventListener("scroll", function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; update(); });
  }, { passive: true });
  window.addEventListener("resize", update);
  update();
})();

// ── 앱 설치(PWA): 오프라인에서도 마지막 화면을 볼 수 있게 ────────
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () { /* 설치 실패해도 사이트는 동작 */ });
  });
}
