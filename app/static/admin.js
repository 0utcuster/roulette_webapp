const $ = (id)=>document.getElementById(id);
const tg = window.Telegram?.WebApp;
if(tg){ tg.ready(); tg.expand(); }

function initDataHeader(){
  const initData = tg?.initData || "";
  return initData ? { "X-Tg-Init-Data": initData } : {};
}
async function api(path, opts={}){
  const res = await fetch(path, {
    headers: { "Content-Type":"application/json", ...(opts.headers||{}), ...initDataHeader() },
    ...opts,
  });
  const txt = await res.text();
  let data=null; try{ data=txt?JSON.parse(txt):null; }catch{ data={raw:txt}; }
  if(!res.ok) throw new Error(data?.detail || "Ошибка");
  return data;
}
function setMsg(t){ $("msg").textContent=t; }
function esc(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");}

function prizeRow(p){
  return `<div class="rounded-2xl bg-white/5 border border-white/15 p-3 flex items-center justify-between gap-3" data-key="${p.key}">
    <div class="min-w-0">
      <div class="font-extrabold text-sm">${esc(p.key)}</div>
      <div class="text-[11px] text-white/60">weight</div>
    </div>
    <div class="flex items-center gap-2">
      <input class="w-24 bg-transparent border-b border-white/20 focus:outline-none text-right" type="number" min="0" value="${p.weight}" data-weight />
      <label class="text-[11px] text-white/70 flex items-center gap-2">
        <input type="checkbox" ${p.is_enabled ? "checked" : ""} data-on />
        on
      </label>
    </div>
  </div>`;
}

function refSummaryRow(r){
  const dep = (r.total_deposit||0);
  const bonus = (r.total_bonus||0);
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

function refInviteeRow(x){
  const reg = x.created_at ? new Date(x.created_at).toLocaleString("ru-RU",{dateStyle:"short", timeStyle:"short"}) : "—";
  return `<div class="rounded-2xl bg-white/5 border border-white/15 p-3 text-sm">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="font-extrabold">invitee ${x.user_id}</div>
        <div class="text-xs text-white/70">регистрация: ${reg}</div>
      </div>
      <div class="text-right">
        <div class="text-xs text-white/60">пополнено</div>
        <div class="font-extrabold">${x.deposit_sum||0}⭐</div>
      </div>
    </div>
  </div>`;
}

function readRefFilters(){
  const q = ($("refSearch")?.value || "").trim();
  const from = $("refFrom")?.value || "";
  const to = $("refTo")?.value || "";
  return { q, from, to };
}

async function loadReferrals(){
  const {q, from, to} = readRefFilters();
  const u = new URL("/api/admin/referrals/summary", window.location.origin);
  if(q) u.searchParams.set("q", q);
  if(from) u.searchParams.set("from", from);
  if(to) u.searchParams.set("to", to);
  const data = await api(u.toString().replace(window.location.origin,""));
  $("refSummary").innerHTML = (data.items||[]).map(refSummaryRow).join("") || `<div class="text-sm text-white/70">Нет данных по рефералам.</div>`;
  Array.from(document.querySelectorAll("[data-referrer]"))
    .forEach(btn=>btn.addEventListener("click", ()=>loadReferralDetails(parseInt(btn.dataset.referrer,10)).catch(e=>setMsg(e.message||"Ошибка"))));
}

async function loadReferralDetails(referrerId){
  const {q, from, to} = readRefFilters();
  const u = new URL("/api/admin/referrals/details", window.location.origin);
  u.searchParams.set("referrer_id", String(referrerId));
  if(q) u.searchParams.set("q", q);
  if(from) u.searchParams.set("from", from);
  if(to) u.searchParams.set("to", to);
  const data = await api(u.toString().replace(window.location.origin,""));
  $("refDetailsTitle").textContent = String(referrerId);
  $("refDetails").innerHTML = (data.invitees||[]).map(refInviteeRow).join("") || `<div class="text-sm text-white/70">Нет приглашённых по этому рефереру.</div>`;
  $("refDetailsWrap").classList.remove("hidden");
}

function closeRefDetails(){
  $("refDetailsWrap").classList.add("hidden");
  $("refDetails").innerHTML = "";
  $("refDetailsTitle").textContent = "—";
}

async function loadAll(){
  const prizes = await api("/api/admin/prizes");
  $("prizes").innerHTML = prizes.items.map(prizeRow).join("");
  const wds = await api("/api/admin/withdraws");
  $("withdraws").innerHTML = wds.items.map(x=>`
    <div class="rounded-2xl bg-white/5 border border-white/15 p-3 text-sm">
      <div class="font-extrabold">#${x.id} · user ${x.user_id}</div>
      <div class="text-xs text-white/70">amount ${x.amount} · status ${x.status}</div>
    </div>
  `).join("");
  const prs = await api("/api/admin/prize_requests");
  $("prizereqs").innerHTML = prs.items.map(x=>`
    <div class="rounded-2xl bg-white/5 border border-white/15 p-3 text-sm">
      <div class="font-extrabold">#${x.id} · user ${x.user_id}</div>
      <div class="text-xs text-white/70">prize ${x.prize_type} · status ${x.status}</div>
    </div>
  `).join("");

  if($("refSummary")) await loadReferrals();
}

async function savePrizes(){
  const rows = Array.from(document.querySelectorAll("[data-key]"));
  const items = rows.map(r=>({
    key: r.dataset.key,
    weight: parseInt(r.querySelector("[data-weight]").value,10) || 0,
    is_enabled: r.querySelector("[data-on]").checked
  }));
  await api("/api/admin/prizes", { method:"PUT", body: JSON.stringify({items}) });
  setMsg("Сохранено ✅");
  await loadAll();
}

async function applyAdjust(){
  const payload = {
    user_id: parseInt($("uId").value,10),
    balance_delta: parseInt($("bal").value,10) || 0,
    tickets_sneakers_delta: parseInt($("ts").value,10) || 0,
    tickets_bracelet_delta: parseInt($("tb").value,10) || 0,
    note: $("note").value || "admin adjust",
  };
  await api("/api/admin/adjust", { method:"POST", body: JSON.stringify(payload) });
  setMsg("Применено ✅");
}

document.addEventListener("DOMContentLoaded", ()=>{
  $("loadAll").addEventListener("click", ()=>loadAll().then(()=>setMsg("Загружено")).catch(e=>setMsg(e.message||"Ошибка")));
  $("savePrizes").addEventListener("click", ()=>savePrizes().catch(e=>setMsg(e.message||"Ошибка")));
  $("apply").addEventListener("click", ()=>applyAdjust().catch(e=>setMsg(e.message||"Ошибка")));

  $("loadRefs")?.addEventListener("click", ()=>loadReferrals().then(()=>setMsg("Рефералы обновлены")).catch(e=>setMsg(e.message||"Ошибка")));
  $("refDetailsClose")?.addEventListener("click", closeRefDetails);
  ["refSearch","refFrom","refTo"].forEach(id=>$(id)?.addEventListener("change", ()=>loadReferrals().catch(()=>{})));
});
