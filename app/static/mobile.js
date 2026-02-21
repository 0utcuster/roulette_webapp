const tg = window.Telegram?.WebApp || null;

function $(id){ return document.getElementById(id); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function esc(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

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
  let data=null;
  try{ data = txt ? JSON.parse(txt) : null; }catch{ data = { raw: txt }; }
  if(!res.ok) throw new Error(data?.detail || "Ошибка");
  return data;
}

let ROULETTE_IMAGES=null;
async function loadRouletteImages(){
  if(ROULETTE_IMAGES) return ROULETTE_IMAGES;
  const res = await fetch("/static/prizes/roulettes.json");
  ROULETTE_IMAGES = await res.json();
  return ROULETTE_IMAGES;
}
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randint(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

function keyTitle(key){
  const m={
    shoes:"👟 Обувь",
    women_shoes:"👟 Женская обувь",
    limited_shoes:"👟 Лимит обувь",
    hoodie:"🧥 Толстовка",
    women_hoodie:"🧥 Женские толстовки",
    exclusive_hoodie:"🧥 Эксклюзив худи",
    tshirt:"👕 Футболка",
    jeans:"👖 Джинсы",
    bracelet:"📿 Браслет",
    cert_3000:"🎁 Сертификат 3000₽",
    full_look:"🛍️ Полный образ",
    vip_key:"🔐 VIP-ключ",
    stars_0:"⭐ 0",
    stars_50:"⭐ 50",
    stars_100:"⭐ 100",
    stars_200:"⭐ 200",
    stars_300:"⭐ 300",
    discount_10:"💸 10%",
    discount_15:"💸 15%",
    discount_20:"💸 20%",
    discount_25:"💸 25%",
    discount_30:"💸 30%",
    discount_50:"💸 50%",
    stars_150:"⭐ 150",
    stars_500:"⭐ 500",
    stars_1000:"⭐ 1000",
  };
  return m[key] || String(key || "").replaceAll("_"," ");
}

function keyBadge(key){
  if(String(key).startsWith("discount_")) return "Скидка";
  if(String(key).startsWith("stars_")) return "Stars";
  return "Приз";
}

function isHighTierPrize(key){
  const k = String(key || "");
  return [
    "stars_1000",
    "stars_500",
    "cert_3000",
    "vip_key",
    "full_look",
    "limited_shoes",
    "exclusive_hoodie",
  ].includes(k);
}

let state={ rouletteId:null, rouletteCost:0, currentCase:null, cases:[] };
let modalOpenCount = 0;
let lockedScrollY = 0;

function setMsg(text){ const el=$("msg"); if(el) el.textContent=text||"—"; }

function openResultOverlay({badge="Статус", title="", text="", primary="Ок", secondary="", onPrimary=null, onSecondary=null}){
  const box=$("resultOverlay");
  if(!box) return;
  $("resultBadge").textContent=badge;
  $("resultTitle").textContent=title;
  $("resultText").textContent=text;

  const p=$("resultPrimary");
  const s=$("resultSecondary");
  p.textContent=primary || "Ок";
  s.textContent=secondary || "Ок";

  if(secondary){
    s.classList.remove("hidden");
    p.classList.remove("col-span-2");
  }else{
    s.classList.add("hidden");
    p.classList.add("col-span-2");
  }

  p.onclick=()=>{
    closeModal("resultOverlay");
    if(typeof onPrimary==="function") onPrimary();
  };
  s.onclick=()=>{
    closeModal("resultOverlay");
    if(typeof onSecondary==="function") onSecondary();
  };

  openModal("resultOverlay");
}

function launchDropFx(count=28){
  const layer=$("fxLayer");
  if(!layer) return;
  const icons=["⭐","✨","💥","🎉","🔥"];
  for(let i=0;i<count;i++){
    const el=document.createElement("div");
    el.className="fx-star";
    el.textContent=icons[randint(0,icons.length-1)];
    el.style.left=`${randint(2,96)}vw`;
    el.style.top=`${randint(-8,4)}vh`;
    el.style.animationDuration=`${(1.3 + Math.random()*1.2).toFixed(2)}s`;
    el.style.fontSize=`${randint(14,24)}px`;
    layer.appendChild(el);
    setTimeout(()=>el.remove(),2600);
  }
}

function setupOnlineCounter(){
  const el=$("onlineCount"); if(!el) return;
  const now = new Date();
  const h = now.getHours();
  let base = 10;
  if(h >= 0 && h < 7) base = 5;
  else if(h >= 7 && h < 12) base = 9;
  else if(h >= 12 && h < 18) base = 12;
  else if(h >= 18 && h < 24) base = 16;
  const update=()=>{ el.textContent = String(Math.max(3, base + randint(-2,2))); };
  update();
  setInterval(update, 9000);
}

function setupLiveWinsFeed(){
  const toast=$("liveWinToast");
  const text=$("liveWinText");
  if(!toast || !text) return;
  const names=["mike","lina","ghost","vovan","ninja","sova","astro","max","kira","qwerty","neo","panda"];
  const prizes=["Обувь","Толстовка","Скидка 20%","200⭐","1000⭐","Сертификат 3000₽","VIP-ключ"];
  const show=()=>{
    const n=names[randint(0,names.length-1)];
    const p=prizes[randint(0,prizes.length-1)];
    text.textContent=`${n} выиграл: ${p}`;
    toast.classList.add("show");
    setTimeout(()=>toast.classList.remove("show"), 3600);
  };
  setTimeout(show, 5000);
  setInterval(show, randint(14000,22000));
}

function setupEventBanner(cfg){
  const e = cfg?.event || {};
  if($("eventBannerTitle")) $("eventBannerTitle").textContent = e.title || "ИВЕНТ К 23 ФЕВРАЛЯ";
  if($("eventBannerSubtitle")) $("eventBannerSubtitle").textContent = e.subtitle || "Праздничный дроп";
  if($("eventBannerImg") && e.image) $("eventBannerImg").src = e.image;
  if($("eventModalTitle")) $("eventModalTitle").textContent = e.title || "ИВЕНТ К 23 ФЕВРАЛЯ";
  if($("eventModalText")) $("eventModalText").textContent = e.text || "Открывайте кейсы и забирайте праздничные награды.";
  if($("eventModalImg") && e.image) $("eventModalImg").src = e.image;
}

function setupProfileIdentity(){
  const u = tg?.initDataUnsafe?.user;
  if(!u) return;
  if($("userName")) $("userName").textContent = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Игрок";
  if($("userHandle")) $("userHandle").textContent = u.username ? `@${u.username}` : `id${u.id || ""}`;
  if($("userAvatar") && u.photo_url) $("userAvatar").src = u.photo_url;
}

function setBalance(balance){
  if($("balance")) $("balance").textContent=String(balance ?? "—");
  if($("balance-top")) $("balance-top").textContent=`${balance ?? "—"}⭐`;
}

function setTickets(s,b){
  if($("tSneakers")) $("tSneakers").textContent=String(s||0);
  if($("tBracelet")) $("tBracelet").textContent=String(b||0);

  const total=(s||0)+(b||0);
  const preview=$("vaultPreviewCard");
  if(preview){
    if(total>0) preview.classList.remove("hidden");
    else preview.classList.add("hidden");
  }
  if(total>0 && localStorage.getItem("vault_shown_once")!=="1"){
    localStorage.setItem("vault_shown_once","1");
    openModal("ticketVaultModal");
  }

}

async function loadInventory(){
  const data = await api("/api/inventory", { method:"GET" });
  const items = data.items || [];
  const box = $("inventoryList");
  if(box){
    box.innerHTML = items.length ? items.map((it)=>`
      <div class="rounded-2xl bg-white/5 border border-white/15 p-3 flex items-center justify-between">
        <div class="font-extrabold">${keyTitle(it.code)}</div>
        <div class="text-sm">x${it.count}</div>
      </div>
    `).join("") : `<div class="text-xs text-white/60">Пока пусто. Откройте кейсы, чтобы получить первые доступы.</div>`;
  }
  const progressBox = $("progressList");
  if(progressBox){
    const rows = data.progress || [];
    progressBox.innerHTML = rows.length ? rows.map((p, idx)=>`
      <div>
        <div class="flex items-center justify-between text-[11px] text-white/70">
          <span class="truncate pr-3">${esc(keyTitle(p.code))}</span>
          <span>${Number(p.current || 0)}/${Number(p.target || 1)}</span>
        </div>
        <div class="mt-1 h-2.5 rounded-full bg-white/10 overflow-hidden">
          <div class="h-full ${idx % 2 === 0 ? "bg-gradient-to-r from-amber-300 to-orange-400" : "bg-gradient-to-r from-cyan-300 to-blue-400"}" style="width:${Math.max(0, Math.min(100, Number(p.percent || 0)))}%"></div>
        </div>
        <div class="mt-1 text-[11px] text-white/60">Осталось: ${Math.max(0, Number(p.left || 0))}</div>
      </div>
    `).join("") : `<div class="text-[11px] text-white/60">Пока нет прогресса. Открывайте кейсы.</div>`;
  }
  return data;
}

function openCasePreview(c){
  const modal=$("casePreviewModal"); if(!modal) return;
  const items=c.items||{};
  const firstKey=Object.keys(items)[0];
  const thumb=c.avatar || (firstKey ? ((items[firstKey]||[])[0] || "") : "");
  $("casePreviewImg").src=thumb || "";
  $("casePreviewTitle").textContent=c.title || c.id;
  $("casePreviewDesc").textContent=c.desc || "Открой кейс и забери мощный дроп.";
  $("casePreviewPrice").textContent=`${c.cost}⭐`;
  $("casePreviewPrizes").innerHTML = Object.keys(items).slice(0,6).map(k=>`<span class="case-tag">${esc(keyTitle(k))}</span>`).join("") || `<span class="case-tag">Без призов</span>`;
  $("casePreviewSelect").onclick=async ()=>{
    await selectCase(c, {silent:false});
    closeModal("casePreviewModal");
  };
  openModal("casePreviewModal");
}

async function selectCase(c, {silent=true}={}){
  state.currentCase=c;
  state.rouletteId=c.id;
  state.rouletteCost=c.cost;

  document.querySelectorAll(".roulette-card").forEach(x=>x.classList.remove("selected","ring-2","ring-white/40"));
  const cards=[...document.querySelectorAll(".roulette-card")];
  const idx=state.cases.findIndex(x=>x.id===c.id);
  if(idx>=0 && cards[idx]) cards[idx].classList.add("selected","ring-2","ring-white/40");

  if($("roulette-title")) $("roulette-title").textContent=c.title;
  if($("spin-cost")) $("spin-cost").textContent=String(c.cost);
  if($("spinCost")) $("spinCost").textContent=String(c.cost);
  if($("spinCostTitle")) $("spinCostTitle").textContent=String(c.cost);
  if($("spin-cost-inline")) $("spin-cost-inline").textContent=String(c.cost);

  await buildReel(c.id, "reelModal");
  const openBtn=$("openSpinModalBtn");
  if(openBtn){
    openBtn.disabled=false;
    openBtn.classList.remove("opacity-50");
    openBtn.classList.add("pulse");
    openBtn.textContent=`Открыть ${c.title}`;
  }
  if($("spinModalTitle")) $("spinModalTitle").textContent=c.title;
  if(!silent){
    openModal("caseSpinModal");
    setMsg(`Выбран кейс: ${c.title}. Можно крутить.`);
  }
}

async function buildRouletteGrid(){
  const grid=$("roulette-grid");
  if(!grid) return;

  const imgs=await loadRouletteImages();
  const list=Object.keys(imgs.roulettes||{}).map(id=>({
    id,
    title: imgs.roulettes[id].title||id,
    cost: imgs.roulettes[id].spin_cost||150,
    desc: imgs.roulettes[id].desc || "Выбери кейс и забирай лучший дроп",
    avatar: imgs.roulettes[id].avatar || "",
    items: imgs.roulettes[id].items||{}
  }));
  state.cases=list;

  grid.innerHTML="";
  for(const c of list){
    const firstKey = Object.keys(c.items||{})[0];
    const thumb = c.avatar || (firstKey ? ((c.items[firstKey]||[])[0] || "") : "");
    const btn=document.createElement("button");
    btn.className="roulette-card text-left rounded-3xl border border-white/15 bg-white/5 overflow-hidden relative p-2";
    btn.innerHTML=`
      <div class="case-cover">
        ${thumb?`<img src="${thumb}" alt="${esc(c.title)}"/>`:``}
        <div class="absolute left-2 top-2 z-10 case-tag">${c.cost}⭐</div>
        <div class="absolute left-2 right-2 bottom-2 z-10 text-sm font-black truncate">${esc(c.title)}</div>
      </div>
      <div class="p-2">
        <div class="text-[11px] text-white/60 line-clamp-2">${esc(c.desc)}</div>
      </div>
    `;
    btn.addEventListener("click", ()=>openCasePreview(c));
    grid.appendChild(btn);
  }

  const openBtn=$("openSpinModalBtn");
  if(openBtn){
    openBtn.disabled=true;
    openBtn.classList.remove("pulse");
    openBtn.classList.add("opacity-50");
    openBtn.textContent="Сначала выберите кейс";
  }
}

async function buildReel(rouletteId, reelId="reelModal"){
  const reel=$(reelId); if(!reel) return;

  const imgs=await loadRouletteImages();
  const itemsMap=imgs.roulettes?.[rouletteId]?.items||{};
  const keys=Object.keys(itemsMap).filter(k=>itemsMap[k] && itemsMap[k].length);
  if(!keys.length){
    reel.innerHTML="";
    return;
  }

  reel.innerHTML="";
  for(let i=0;i<40;i++){
    const key=keys[i%keys.length];
    const el=document.createElement("div");
    el.className="prize-card";
    el.dataset.key=key;
    el.innerHTML=`
      <img class="prize-img" src="${pick(itemsMap[key])}" />
      <div class="prize-overlay"></div>
      <div class="prize-badge">${keyBadge(key)}</div>
      <div class="prize-title">${keyTitle(key)}</div>
    `;
    reel.appendChild(el);
  }
  reel.style.transition="none";
  reel.style.transform="translateY(0px)";
}

async function animateToPrize(prizeKey, reelId="reelModal"){
  const reel=$(reelId);
  const items=[...reel.querySelectorAll(".prize-card")];
  if(!items.length) return;

  const cand=[];
  items.forEach((el,i)=>{ if(el.dataset.key===prizeKey) cand.push(i); });
  const targetIndex = cand.length ? cand[Math.floor(Math.random()*cand.length)] : 10;

  const containerHeight = reel.parentElement.clientHeight;
  const targetEl = items[targetIndex];
  const targetCenter = targetEl.offsetTop + targetEl.offsetHeight / 2;
  const targetY = containerHeight / 2 - targetCenter;
  const startY = 0;
  const distance = targetY - startY;
  const duration = 7000;
  const now = () => (window.performance?.now ? window.performance.now() : Date.now());

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const wrap = reel.parentElement;

  reel.style.transform = `translateY(${startY}px)`;
  reel.style.filter = "blur(0px) saturate(1)";
  let lastY = startY;
  let lastTs = now();

  await new Promise((resolve) => {
    const t0 = now();
    const frame = () => {
      const ts = now();
      const p = clamp01((ts - t0) / duration);

      // Continuous acceleration and deceleration across full spin.
      const y = startY + distance * easeInOutCubic(p);

      const dt = Math.max(1, ts - lastTs);
      const speed = Math.abs(y - lastY) / dt; // px per ms
      let blur = Math.min(0.6, speed * 0.62);
      if (p > 0.8) blur *= (1 - ((p - 0.8) / 0.2));
      blur = Math.max(0, blur);

      reel.style.transform = `translateY(${y}px)`;
      reel.style.filter = `blur(${blur.toFixed(2)}px) saturate(${(1 + blur * 0.02).toFixed(2)})`;
      if (wrap) {
        const glow = (0.16 + (speed * 0.08));
        wrap.style.boxShadow = `0 0 30px rgba(255,188,88,${Math.min(0.38, glow).toFixed(2)}) inset`;
      }
      lastY = y;
      lastTs = ts;

      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        reel.style.transform = `translateY(${targetY}px)`;
        reel.style.filter = "blur(0px) saturate(1)";
        if (wrap) wrap.style.boxShadow = "";
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

async function loadMe(){
  const me=await api("/api/me", { method:"GET" });
  setBalance(me.balance);
  setTickets(me.tickets_sneakers, me.tickets_bracelet);
  if($("hotStreak")) $("hotStreak").textContent=String(Math.max(1, me.tickets_sneakers + me.tickets_bracelet || 1));

  if($("refLink")) $("refLink").value = me.ref_link || "—";
  if(me.is_admin) $("adminLink")?.classList.remove("hidden");
}

async function loadHistory(){
  const box=$("history");
  if(!box) return;

  const data = await api("/api/history", { method:"GET" });
  const items = data.items || [];
  if(!items.length){
    box.innerHTML = `<div class="text-xs text-white/60">Операций пока нет.</div>`;
    return;
  }
  box.innerHTML="";
  for(const it of items.slice(0, 20)){
    const el=document.createElement("div");
    el.className="rounded-2xl bg-white/5 border border-white/15 p-3";
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="font-extrabold text-sm">${it.type || "op"}</div>
        <div class="text-xs text-white/60">${it.amount ?? ""}</div>
      </div>
      <div class="text-[11px] text-white/60 mt-1">${it.description || ""}</div>
      <div class="text-[11px] text-white/40 mt-1">${it.date || ""}</div>
    `;
    box.appendChild(el);
  }
}

async function loadMyReferrals(){
  const box=$("myReferrals");
  if(!box) return;
  const data=await api("/api/referrals/my", { method:"GET" });
  const items=data.items||[];
  if(!items.length){
    box.innerHTML = `<div class="text-xs text-white/60">Пока нет приглашённых.</div>`;
    return;
  }
  box.innerHTML = items.slice(0,30).map((x)=>`
    <div class="rounded-2xl bg-white/5 border border-white/15 p-3">
      <div class="flex items-center justify-between">
        <div class="text-sm font-extrabold">ID ${x.user_id}</div>
        <div class="text-xs text-white/70">депозит: ${x.deposit_sum}⭐</div>
      </div>
      <div class="text-[11px] text-white/55 mt-1">дата: ${x.created_at || "—"}</div>
    </div>
  `).join("");
}

function openModal(id){
  const m=$(id);
  if(!m || !m.classList.contains("hidden")) return;
  m.classList.remove("hidden");
  if(modalOpenCount === 0){
    lockedScrollY = window.scrollY || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
  }
  modalOpenCount += 1;
}
function closeModal(id){
  const m=$(id);
  if(!m || m.classList.contains("hidden")) return;
  m.classList.add("hidden");
  modalOpenCount = Math.max(0, modalOpenCount - 1);
  if(modalOpenCount === 0){
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    window.scrollTo(0, lockedScrollY);
  }
}

async function doDeposit(amount){
  const inv = await api("/api/stars/invoice", {
    method:"POST",
    body: JSON.stringify({
      amount,
      title:"Пополнение баланса",
      description:`Пополнение на ${amount} Stars`,
    })
  });

  if(!tg) throw new Error("Открывайте через Telegram");

  tg.openInvoice(inv.invoice_link, (status)=>{
    if(status==="paid"){
      setMsg("✅ Оплата прошла. Обновляю баланс…");
      setTimeout(()=>loadMe().catch(()=>{}), 1200);
      openResultOverlay({
        badge:"Успех",
        title:"Баланс пополнен",
        text:`Оплата на ${amount}⭐ прошла успешно.`,
        primary:"Продолжить"
      });
    }else{
      setMsg("Платёж не завершён.");
    }
  });
}

async function doWithdraw(amount){
  await api("/api/withdraw", {
    method:"POST",
    body: JSON.stringify({ amount })
  });
  setMsg("✅ Запрос на вывод создан.");
  await loadMe();
}

async function doSpin(){
  const btn=$("spinBtn"); if(btn) btn.disabled=true;
  try{
    if(!state.currentCase){
      throw new Error("Сначала выберите кейс");
    }
    setMsg("Крутим…");
    await buildReel(state.rouletteId, "reelModal");
    const res = await api("/api/spin", {
      method:"POST",
      body: JSON.stringify({ roulette_id: state.rouletteId })
    });
    await animateToPrize(res.prize_key, "reelModal");

    $("spinResult")?.classList.remove("hidden");
    if($("spinText")) $("spinText").textContent = res.message || "—";

    setBalance(res.balance);
    setTickets(res.tickets_sneakers, res.tickets_bracelet);
    await loadInventory().catch(()=>{});
    setMsg("✅ Готово!");
    launchDropFx(34);
    const spinModal=$("caseSpinModal");
    spinModal?.classList.add("shadow-[0_0_40px_rgba(255,190,95,.35)]");
    setTimeout(()=>spinModal?.classList.remove("shadow-[0_0_40px_rgba(255,190,95,.35)]"), 900);
    openResultOverlay({
      badge:"Выигрыш",
      title:keyTitle(res.prize_key || ""),
      text:res.message || "Результат начислен",
      primary:"Продолжить"
    });
  }catch(e){
    const msg=String(e.message||"Ошибка");
    setMsg(`Ошибка: ${msg}`);
    if(msg.toLowerCase().includes("недостаточно")){
      openResultOverlay({
        badge:"Недостаточно баланса",
        title:"Не хватает Stars",
        text:`Для открытия нужно ${state.rouletteCost}⭐`,
        primary:"Пополнить",
        secondary:"Позже",
        onPrimary:()=>{$("depositBtn")?.click();}
      });
    }else{
      openResultOverlay({
        badge:"Ошибка",
        title:"Спин не выполнен",
        text:msg,
        primary:"Понятно"
      });
    }
  }finally{
    if(btn) btn.disabled=false;
  }
}

document.addEventListener("DOMContentLoaded", async ()=>{
  try{
    if(tg){ tg.ready(); tg.expand?.(); }

    $("casePreviewClose")?.addEventListener("click", ()=>closeModal("casePreviewModal"));
    $("caseSpinClose")?.addEventListener("click", ()=>closeModal("caseSpinModal"));
    $("ticketVaultClose")?.addEventListener("click", ()=>closeModal("ticketVaultModal"));
    $("openVaultBtn")?.addEventListener("click", async ()=>{
      await loadInventory().catch(()=>{});
      openModal("ticketVaultModal");
    });
    $("openProfileBtn")?.addEventListener("click", async ()=>{
      await loadHistory().catch(()=>{});
      await loadMyReferrals().catch(()=>{});
      openModal("profileModal");
    });
    $("profileClose")?.addEventListener("click", ()=>closeModal("profileModal"));
    $("eventBannerBtn")?.addEventListener("click", ()=>openModal("eventModal"));
    $("eventModalClose")?.addEventListener("click", ()=>closeModal("eventModal"));
    $("eventModalAction")?.addEventListener("click", ()=>{
      closeModal("eventModal");
      openResultOverlay({
        badge:"Event",
        title:"Ивент активирован",
        text:"Открывайте кейсы в прайм-тайм и поднимайтесь в топе.",
        primary:"К кейсам"
      });
    });
    $("openSpinModalBtn")?.addEventListener("click", ()=>{
      if(!state.currentCase){
        openResultOverlay({
          badge:"Сначала выбор",
          title:"Кейс не выбран",
          text:"Выберите любой кейс сверху и подтвердите выбор.",
          primary:"Понятно"
        });
        return;
      }
      openModal("caseSpinModal");
    });

    $("depositBtn")?.addEventListener("click", ()=>{
      $("depositAmount").value = "";
      openModal("depositModal");
    });
    $("depositCancel")?.addEventListener("click", ()=>closeModal("depositModal"));
    $("depositConfirm")?.addEventListener("click", async ()=>{
      const v = parseInt(($("depositAmount").value||"").trim(), 10);
      if(!Number.isFinite(v) || v <= 0) return setMsg("Введите корректную сумму пополнения.");
      closeModal("depositModal");
      await doDeposit(v).catch(e=>setMsg(e.message));
    });

    $("withdrawBtn")?.addEventListener("click", ()=>{
      $("withdrawAmount").value = "";
      openModal("withdrawModal");
    });
    $("withdrawCancel")?.addEventListener("click", ()=>closeModal("withdrawModal"));
    $("withdrawConfirm")?.addEventListener("click", async ()=>{
      const v = parseInt(($("withdrawAmount").value||"").trim(), 10);
      if(!Number.isFinite(v) || v < 1000) return setMsg("Минимум для вывода — 1000⭐.");
      closeModal("withdrawModal");
      await doWithdraw(v).catch(e=>setMsg(e.message));
    });

    $("spinBtn")?.addEventListener("click", ()=>doSpin());

    $("copyRef")?.addEventListener("click", async ()=>{
      const v=$("refLink")?.value || "";
      if(!v || v==="—") return;
      await navigator.clipboard.writeText(v);
      setMsg("Ссылка скопирована ✅");
    });

    await buildRouletteGrid();
    const cfg=await loadRouletteImages();
    setupProfileIdentity();
    setupEventBanner(cfg);
    setupOnlineCounter();
    setupLiveWinsFeed();
    await loadMe();
    await loadInventory().catch(()=>{});

  }catch(e){
    setMsg(`Ошибка: ${e.message}`);
  }
});
