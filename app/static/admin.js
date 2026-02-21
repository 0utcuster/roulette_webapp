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
let MEDIA_CONFIG = { event: {}, roulettes: {}, ticket_targets: {} };

function ensureMediaShape() {
  if (!MEDIA_CONFIG || typeof MEDIA_CONFIG !== "object") MEDIA_CONFIG = {};
  if (!MEDIA_CONFIG.event || typeof MEDIA_CONFIG.event !== "object") MEDIA_CONFIG.event = {};
  if (!MEDIA_CONFIG.roulettes || typeof MEDIA_CONFIG.roulettes !== "object") MEDIA_CONFIG.roulettes = {};
  if (!MEDIA_CONFIG.ticket_targets || typeof MEDIA_CONFIG.ticket_targets !== "object") MEDIA_CONFIG.ticket_targets = {};
}

function collectItemCodesFromCases() {
  const set = new Set();
  for (const c of CASES || []) {
    for (const p of c.prizes || []) {
      if ((p.type || "") === "item" && (p.code || "").trim()) set.add(p.code.trim());
    }
  }
  return Array.from(set);
}

async function uploadImage(file) {
  if (!file) throw new Error("Файл не выбран");
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/admin/upload_image", {
    method: "POST",
    headers: { ...initDataHeader() },
    body: fd,
  });
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(data?.detail || "Ошибка загрузки");
  return data.url;
}

function renderTicketTargetsRows() {
  const box = $("ticketTargetsRows");
  if (!box) return;
  const codes = Array.from(new Set([...(collectItemCodesFromCases()), ...Object.keys(MEDIA_CONFIG.ticket_targets || {})])).sort();
  box.innerHTML = codes.length ? codes.map((code) => `
    <div class="grid grid-cols-[1fr_110px] gap-2 items-center">
      <div class="text-sm font-extrabold">${esc(code)}</div>
      <input data-target-code="${esc(code)}" type="number" min="1" class="rounded-xl bg-black/20 border border-white/10 px-2 py-2 text-sm" value="${Number(MEDIA_CONFIG.ticket_targets?.[code] || (code === "shoes" ? 10 : 5))}" />
    </div>
  `).join("") : `<div class="text-xs text-white/60">Нет item-кодов в кейсах.</div>`;
}

function renderMediaRows() {
  const box = $("mediaPrizeRows");
  if (!box) return;
  const rows = [];
  for (const [rid, r] of Object.entries(MEDIA_CONFIG.roulettes || {})) {
    if (!r || typeof r !== "object") continue;
    rows.push({
      label: `${rid} · avatar`,
      bind: `avatar|${rid}`,
      url: String(r.avatar || ""),
    });
    const items = r.items || {};
    for (const [code, arr] of Object.entries(items)) {
      const img = Array.isArray(arr) && arr.length ? String(arr[0]) : "";
      rows.push({
        label: `${rid} · ${code}`,
        bind: `item|${rid}|${code}`,
        url: img,
      });
    }
  }
  box.innerHTML = rows.map((row) => `
    <div class="rounded-2xl border border-white/10 bg-black/20 p-2">
      <div class="text-xs text-white/70 mb-2">${esc(row.label)}</div>
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
        <input data-media-bind="${esc(row.bind)}" class="rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-xs w-full" value="${esc(row.url)}" />
        <input data-media-file="${esc(row.bind)}" type="file" accept="image/*" class="text-xs" />
        <button data-media-upload="${esc(row.bind)}" class="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-xs font-extrabold">Загрузить</button>
      </div>
      <img data-media-preview="${esc(row.bind)}" src="${esc(row.url)}" class="mt-2 w-full h-20 object-cover rounded-xl border border-white/10 bg-black/20" />
    </div>
  `).join("");

  Array.from(document.querySelectorAll("[data-media-upload]")).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const bind = btn.dataset.mediaUpload;
      const fileInput = document.querySelector(`[data-media-file="${CSS.escape(bind)}"]`);
      const urlInput = document.querySelector(`[data-media-bind="${CSS.escape(bind)}"]`);
      const preview = document.querySelector(`[data-media-preview="${CSS.escape(bind)}"]`);
      try {
        const file = fileInput?.files?.[0];
        const url = await uploadImage(file);
        if (urlInput) urlInput.value = url;
        if (preview) preview.src = url;
        setMsg("Картинка загружена. Нажмите «Сохранить».");
      } catch (e) {
        setMsg(e.message || "Ошибка загрузки");
      }
    });
  });
}

function renderMediaEditor() {
  ensureMediaShape();
  $("eventTitle").value = MEDIA_CONFIG.event.title || "";
  $("eventSubtitle").value = MEDIA_CONFIG.event.subtitle || "";
  $("eventText").value = MEDIA_CONFIG.event.text || "";
  $("eventImage").value = MEDIA_CONFIG.event.image || "";
  $("eventImagePreview").src = MEDIA_CONFIG.event.image || "";

  if ($("eventImage")) $("eventImage").oninput = () => {
    $("eventImagePreview").src = $("eventImage").value || "";
  };

  if ($("uploadEventImage")) $("uploadEventImage").onclick = async () => {
    try {
      const file = $("eventImageFile")?.files?.[0];
      const url = await uploadImage(file);
      $("eventImage").value = url;
      $("eventImagePreview").src = url;
      setMsg("Картинка баннера загружена. Нажмите «Сохранить».");
    } catch (e) {
      setMsg(e.message || "Ошибка загрузки");
    }
  };

  renderTicketTargetsRows();
  renderMediaRows();
}

async function loadMediaConfig() {
  MEDIA_CONFIG = await api("/api/admin/media_config", { method: "GET" });
  ensureMediaShape();
  renderMediaEditor();
}

async function saveMediaConfig() {
  ensureMediaShape();
  MEDIA_CONFIG.event.title = ($("eventTitle")?.value || "").trim();
  MEDIA_CONFIG.event.subtitle = ($("eventSubtitle")?.value || "").trim();
  MEDIA_CONFIG.event.text = ($("eventText")?.value || "").trim();
  MEDIA_CONFIG.event.image = ($("eventImage")?.value || "").trim();

  const targets = {};
  Array.from(document.querySelectorAll("[data-target-code]")).forEach((el) => {
    const code = String(el.dataset.targetCode || "").trim();
    if (!code) return;
    const v = Math.max(1, parseInt(el.value || "1", 10) || 1);
    targets[code] = v;
  });
  MEDIA_CONFIG.ticket_targets = targets;

  Array.from(document.querySelectorAll("[data-media-bind]")).forEach((el) => {
    const bind = String(el.dataset.mediaBind || "");
    const parts = bind.split("|");
    const url = (el.value || "").trim();
    if (parts[0] === "avatar" && parts[1]) {
      const rid = parts[1];
      MEDIA_CONFIG.roulettes[rid] = MEDIA_CONFIG.roulettes[rid] || {};
      MEDIA_CONFIG.roulettes[rid].avatar = url;
    }
    if (parts[0] === "item" && parts[1] && parts[2]) {
      const rid = parts[1];
      const code = parts[2];
      MEDIA_CONFIG.roulettes[rid] = MEDIA_CONFIG.roulettes[rid] || {};
      MEDIA_CONFIG.roulettes[rid].items = MEDIA_CONFIG.roulettes[rid].items || {};
      const cur = MEDIA_CONFIG.roulettes[rid].items[code];
      if (Array.isArray(cur) && cur.length) MEDIA_CONFIG.roulettes[rid].items[code][0] = url;
      else MEDIA_CONFIG.roulettes[rid].items[code] = [url];
    }
  });

  await api("/api/admin/media_config", { method: "PUT", body: JSON.stringify(MEDIA_CONFIG) });
  setMsg("Медиа-конфиг сохранён ✅");
}

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
  await loadMediaConfig();
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
  $("loadMediaConfig")?.addEventListener("click", () => loadMediaConfig().then(() => setMsg("JSON обновлён")).catch((e) => setMsg(e.message || "Ошибка")));
  $("saveMediaConfig")?.addEventListener("click", () => saveMediaConfig().catch((e) => setMsg(e.message || "Ошибка")));
  $("apply").addEventListener("click", () => applyAdjust().catch((e) => setMsg(e.message || "Ошибка")));

  $("loadRefs")?.addEventListener("click", () => loadReferrals().then(() => setMsg("Рефералы обновлены")).catch((e) => setMsg(e.message || "Ошибка")));
  $("refDetailsClose")?.addEventListener("click", closeRefDetails);
  ["refSearch", "refFrom", "refTo"].forEach((id) => $(id)?.addEventListener("change", () => loadReferrals().catch(() => {})));
});
