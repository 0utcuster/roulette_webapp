const $ = (id) => document.getElementById(id);
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

function initDataHeader() {
  const initData = tg?.initData || "";
  return initData ? { "X-Tg-Init-Data": initData } : {};
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}), ...initDataHeader() },
    ...opts,
  });
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(data?.detail || "Ошибка");
  return data;
}

function setMsg(t) { $("msg").textContent = t; }
function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function refSummaryRow(r) {
  const dep = r.total_deposit || 0;
  const bonus = r.total_bonus || 0;
  return `<button class="w-full text-left rounded-2xl bg-white/5 border border-white/15 p-3" data-referrer="${r.referrer_id}">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="font-extrabold">referrer ${r.referrer_id}</div>
        <div class="text-xs text-white/70">приглашённых: ${r.invited_count} · бонус: ${bonus}⭐</div>
      </div>
      <div class="text-right">
        <div class="text-xs text-white/60">пополнения приглашённых</div>
        <div class="font-extrabold">${dep}⭐</div>
      </div>
    </div>
  </button>`;
}

function refInviteeRow(x) {
  const reg = x.created_at ? new Date(x.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—";
  return `<div class="rounded-2xl bg-white/5 border border-white/15 p-3 text-sm">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="font-extrabold">invitee ${x.user_id}</div>
        <div class="text-xs text-white/70">регистрация: ${reg}</div>
      </div>
      <div class="text-right">
        <div class="text-xs text-white/60">пополнено</div>
        <div class="font-extrabold">${x.deposit_sum || 0}⭐</div>
      </div>
    </div>
  </div>`;
}

function readRefFilters() {
  const q = ($("refSearch")?.value || "").trim();
  const from = $("refFrom")?.value || "";
  const to = $("refTo")?.value || "";
  return { q, from, to };
}

async function loadReferrals() {
  const { q, from, to } = readRefFilters();
  const u = new URL("/api/admin/referrals/summary", window.location.origin);
  if (q) u.searchParams.set("q", q);
  if (from) u.searchParams.set("from", from);
  if (to) u.searchParams.set("to", to);
  const data = await api(u.toString().replace(window.location.origin, ""));
  $("refSummary").innerHTML = (data.items || []).map(refSummaryRow).join("") || `<div class="text-sm text-white/70">Нет данных по рефералам.</div>`;
  Array.from(document.querySelectorAll("[data-referrer]"))
    .forEach((btn) => btn.addEventListener("click", () => loadReferralDetails(parseInt(btn.dataset.referrer, 10)).catch((e) => setMsg(e.message || "Ошибка"))));
}

async function loadReferralDetails(referrerId) {
  const { q, from, to } = readRefFilters();
  const u = new URL("/api/admin/referrals/details", window.location.origin);
  u.searchParams.set("referrer_id", String(referrerId));
  if (q) u.searchParams.set("q", q);
  if (from) u.searchParams.set("from", from);
  if (to) u.searchParams.set("to", to);
  const data = await api(u.toString().replace(window.location.origin, ""));
  $("refDetailsTitle").textContent = String(referrerId);
  $("refDetails").innerHTML = (data.invitees || []).map(refInviteeRow).join("") || `<div class="text-sm text-white/70">Нет приглашённых по этому рефереру.</div>`;
  $("refDetailsWrap").classList.remove("hidden");
}

function closeRefDetails() {
  $("refDetailsWrap").classList.add("hidden");
  $("refDetails").innerHTML = "";
  $("refDetailsTitle").textContent = "—";
}

function defaultPrize() {
  return { code: "new_prize", title: "Новый приз", type: "item", amount: 1, weight: 1, is_enabled: 1 };
}

function renderPrizeRow(prize, caseId, idx) {
  return `<div class="rounded-2xl border border-white/10 bg-white/5 p-2 grid grid-cols-1 sm:grid-cols-6 gap-2" data-prize-row="${idx}">
    <input data-field="code" class="rounded-xl bg-black/20 border border-white/10 px-2 py-2 text-xs" value="${esc(prize.code || "")}" placeholder="code"/>
    <input data-field="title" class="rounded-xl bg-black/20 border border-white/10 px-2 py-2 text-xs" value="${esc(prize.title || "")}" placeholder="title"/>
    <select data-field="type" class="rounded-xl bg-black/20 border border-white/10 px-2 py-2 text-xs">
      <option value="item" ${prize.type === "item" ? "selected" : ""}>item</option>
      <option value="stars" ${prize.type === "stars" ? "selected" : ""}>stars</option>
      <option value="discount" ${prize.type === "discount" ? "selected" : ""}>discount</option>
    </select>
    <input data-field="amount" type="number" class="rounded-xl bg-black/20 border border-white/10 px-2 py-2 text-xs" value="${Number(prize.amount || 0)}" placeholder="amount"/>
    <input data-field="weight" type="number" min="0" class="rounded-xl bg-black/20 border border-white/10 px-2 py-2 text-xs" value="${Number(prize.weight || 0)}" placeholder="weight"/>
    <div class="flex items-center justify-between gap-2">
      <label class="text-xs text-white/70 flex items-center gap-2"><input data-field="is_enabled" type="checkbox" ${prize.is_enabled ? "checked" : ""}/>on</label>
      <button data-remove-prize="${caseId}:${idx}" class="rounded-xl bg-red-500/20 border border-red-300/20 px-2 py-1 text-xs">Удалить</button>
    </div>
  </div>`;
}

function renderCaseEditor(c) {
  const prizes = (c.prizes || []).map((p, idx) => renderPrizeRow(p, c.id, idx)).join("");
  return `<div class="rounded-3xl bg-white/5 border border-white/15 p-4" data-case-id="${esc(c.id)}">
    <div class="flex items-center justify-between gap-2">
      <div class="font-extrabold">${esc(c.id)}</div>
      <label class="text-xs text-white/70 flex items-center gap-2"><input data-case-field="is_enabled" type="checkbox" ${c.is_enabled ? "checked" : ""}/>кейс включен</label>
    </div>
    <div class="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <input data-case-field="title" class="rounded-2xl bg-black/20 border border-white/10 px-3 py-2 text-sm" value="${esc(c.title || "")}" placeholder="Название"/>
      <input data-case-field="spin_cost" type="number" min="1" class="rounded-2xl bg-black/20 border border-white/10 px-3 py-2 text-sm" value="${Number(c.spin_cost || 0)}" placeholder="Цена спина"/>
      <input data-case-field="slots" type="number" min="1" class="rounded-2xl bg-black/20 border border-white/10 px-3 py-2 text-sm" value="${Number(c.slots || 0)}" placeholder="Слоты"/>
    </div>
    <div class="mt-2 text-[11px] text-white/60">Вероятность = weight / сумма всех weight в кейсе.</div>
    <div class="mt-3 space-y-2" data-prizes>${prizes}</div>
    <button data-add-prize="${esc(c.id)}" class="mt-3 rounded-2xl bg-white/10 border border-white/15 px-3 py-2 text-sm font-extrabold">+ Добавить приз</button>
  </div>`;
}

let CASES = [];

function bindCaseEditorActions() {
  Array.from(document.querySelectorAll("[data-add-prize]")).forEach((btn) => {
    btn.addEventListener("click", () => {
      const cid = btn.dataset.addPrize;
      const c = CASES.find((x) => x.id === cid);
      if (!c) return;
      c.prizes = c.prizes || [];
      c.prizes.push(defaultPrize());
      renderCases();
    });
  });

  Array.from(document.querySelectorAll("[data-remove-prize]")).forEach((btn) => {
    btn.addEventListener("click", () => {
      const [cid, idxStr] = String(btn.dataset.removePrize || "").split(":");
      const idx = parseInt(idxStr, 10);
      const c = CASES.find((x) => x.id === cid);
      if (!c || !Number.isFinite(idx)) return;
      c.prizes.splice(idx, 1);
      renderCases();
    });
  });
}

function renderCases() {
  $("cases").innerHTML = CASES.map(renderCaseEditor).join("");
  bindCaseEditorActions();
}

function readCasesFromDom() {
  return Array.from(document.querySelectorAll("[data-case-id]")).map((caseEl) => {
    const caseId = caseEl.dataset.caseId;
    const getCaseField = (name) => caseEl.querySelector(`[data-case-field="${name}"]`);
    const prizes = Array.from(caseEl.querySelectorAll("[data-prize-row]")).map((row) => {
      const get = (name) => row.querySelector(`[data-field="${name}"]`);
      return {
        code: (get("code")?.value || "").trim(),
        title: (get("title")?.value || "").trim(),
        type: (get("type")?.value || "item").trim(),
        amount: parseInt(get("amount")?.value || "0", 10) || 0,
        weight: Math.max(0, parseInt(get("weight")?.value || "0", 10) || 0),
        is_enabled: get("is_enabled")?.checked ? 1 : 0,
      };
    });
    return {
      id: caseId,
      title: (getCaseField("title")?.value || "").trim(),
      spin_cost: Math.max(1, parseInt(getCaseField("spin_cost")?.value || "1", 10) || 1),
      slots: Math.max(1, parseInt(getCaseField("slots")?.value || "1", 10) || 1),
      is_enabled: getCaseField("is_enabled")?.checked ? 1 : 0,
      prizes,
    };
  });
}

async function loadCases() {
  const data = await api("/api/admin/cases");
  CASES = data.items || [];
  renderCases();
}

async function saveCases() {
  const items = readCasesFromDom();
  await api("/api/admin/cases", { method: "PUT", body: JSON.stringify({ items }) });
  setMsg("Кейсы сохранены ✅");
  await loadCases();
}

async function loadAll() {
  await loadCases();
  const wds = await api("/api/admin/withdraws");
  $("withdraws").innerHTML = wds.items.map((x) => `
    <div class="rounded-2xl bg-white/5 border border-white/15 p-3 text-sm">
      <div class="font-extrabold">#${x.id} · user ${x.user_id}</div>
      <div class="text-xs text-white/70">amount ${x.amount} · status ${x.status}</div>
    </div>
  `).join("");

  const prs = await api("/api/admin/prize_requests");
  $("prizereqs").innerHTML = prs.items.map((x) => `
    <div class="rounded-2xl bg-white/5 border border-white/15 p-3 text-sm">
      <div class="font-extrabold">#${x.id} · user ${x.user_id}</div>
      <div class="text-xs text-white/70">prize ${x.prize_type} · status ${x.status}</div>
    </div>
  `).join("");

  if ($("refSummary")) await loadReferrals();
}

async function applyAdjust() {
  const payload = {
    user_id: parseInt($("uId").value, 10),
    balance_delta: parseInt($("bal").value, 10) || 0,
    tickets_sneakers_delta: parseInt($("ts").value, 10) || 0,
    tickets_bracelet_delta: parseInt($("tb").value, 10) || 0,
    note: $("note").value || "admin adjust",
  };
  await api("/api/admin/adjust", { method: "POST", body: JSON.stringify(payload) });
  setMsg("Применено ✅");
}

document.addEventListener("DOMContentLoaded", () => {
  $("loadAll").addEventListener("click", () => loadAll().then(() => setMsg("Загружено")).catch((e) => setMsg(e.message || "Ошибка")));
  $("saveCases").addEventListener("click", () => saveCases().catch((e) => setMsg(e.message || "Ошибка")));
  $("apply").addEventListener("click", () => applyAdjust().catch((e) => setMsg(e.message || "Ошибка")));

  $("loadRefs")?.addEventListener("click", () => loadReferrals().then(() => setMsg("Рефералы обновлены")).catch((e) => setMsg(e.message || "Ошибка")));
  $("refDetailsClose")?.addEventListener("click", closeRefDetails);
  ["refSearch", "refFrom", "refTo"].forEach((id) => $(id)?.addEventListener("change", () => loadReferrals().catch(() => {})));
});
