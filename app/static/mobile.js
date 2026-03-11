const tg = window.Telegram?.WebApp || null;

function $(id){ return document.getElementById(id); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function initAppLikeViewportLock(){
  // Disable pinch/double-tap zoom in mobile webviews for app-like feel.
  ["gesturestart","gesturechange","gestureend"].forEach((evt)=>{
    document.addEventListener(evt, (e)=>e.preventDefault(), { passive:false });
  });
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e)=>{
    const now = Date.now();
    if(now - lastTouchEnd < 280) e.preventDefault();
    lastTouchEnd = now;
  }, { passive:false });
}

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
let CASES_API_CACHE=null;
async function loadCasesApi(){
  if(CASES_API_CACHE) return CASES_API_CACHE;
  CASES_API_CACHE = await api("/api/cases", { method:"GET" });
  return CASES_API_CACHE;
}
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randint(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

function keyTitle(key){
  const m={
    shoes:"Обувь",
    women_shoes:"Женская обувь",
    limited_shoes:"Лимит обувь",
    hoodie:"Толстовка",
    women_hoodie:"Женские толстовки",
    exclusive_hoodie:"Эксклюзив худи",
    tshirt:"Футболка",
    jeans:"Джинсы",
    bracelet:"Браслет",
    cert_3000:"Сертификат 3000₽",
    full_look:"Полный образ",
    vip_key:"VIP-ключ",
    stars_0:"0 Stars",
    stars_50:"50 Stars",
    stars_100:"100 Stars",
    stars_200:"200 Stars",
    stars_300:"300 Stars",
    discount_10:"Скидка 10%",
    discount_15:"Скидка 15%",
    discount_20:"Скидка 20%",
    discount_25:"Скидка 25%",
    discount_30:"Скидка 30%",
    discount_50:"Скидка 50%",
    stars_150:"150 Stars",
    stars_500:"500 Stars",
    stars_1000:"1000 Stars",
  };
  return m[key] || String(key || "").replaceAll("_"," ");
}

function keyBadge(key){
  if(String(key).startsWith("discount_")) return "Скидка";
  if(String(key).startsWith("stars_")) return "Stars";
  return "Приз";
}

function rarityValue(r){ return ({ blue:1, purple:2, red:3, yellow:4 }[String(r||"blue").toLowerCase()] || 1); }
function rarityKey(r){
  const x = String(r || "blue").toLowerCase();
  return ["blue","purple","red","yellow"].includes(x) ? x : "blue";
}
function rarityLabel(r){
  return ({ blue:"Обычный", purple:"Редкий", red:"Эпический", yellow:"Легендарный" })[rarityKey(r)];
}
function rarityCss(r){ return `rarity-${rarityKey(r)}`; }
function caseTopRarity(caseObj){
  const v = (caseObj?.prizes || []).reduce((acc,p)=>Math.max(acc, rarityValue(p?.rarity)), 1);
  return ({1:"blue",2:"purple",3:"red",4:"yellow"})[v] || "blue";
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

let state={ rouletteId:null, rouletteCost:0, currentCase:null, cases:[], uiConfig:null };
let modalOpenCount = 0;
let lockedScrollY = 0;
let reelAnimRaf = 0;
let reelAnimRunId = 0;
const BOOT = {
  hidden: false,
};
const CASE_ASSET_STATUS = new Map();
const CAPTCHA_CLOTHING_POOL = [
  { code: "shoes", label: "Обувь" },
  { code: "hoodie", label: "Худи" },
  { code: "tshirt", label: "Футболка" },
  { code: "jeans", label: "Джинсы" },
];
const CAPTCHA_DISTRACTOR_POOL = [
  { code: "stars", label: "Stars" },
  { code: "discount", label: "Скидка" },
  { code: "bracelet", label: "Браслет" },
  { code: "cert", label: "Сертификат" },
  { code: "vip", label: "VIP-ключ" },
];
let caseCaptchaResolver = null;
let caseCaptchaTargets = [];

function bootSetProgress(ratio, text=""){
  const clamped = Math.max(0, Math.min(1, Number(ratio || 0)));
  const fill = $("appBootLoaderFill");
  const pct = $("appBootLoaderPercent");
  const txt = $("appBootLoaderText");
  if(fill) fill.style.width = `${(clamped * 100).toFixed(1)}%`;
  if(pct) pct.textContent = `${Math.round(clamped * 100)}%`;
  if(txt && text) txt.textContent = text;
}

function bootHide(){
  if(BOOT.hidden) return;
  BOOT.hidden = true;
  const box = $("appBootLoader");
  if(!box) return;
  box.classList.add("hidden");
  setTimeout(()=>box.remove(), 420);
}

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

function resolvePrizeForWin(prizeKey, prizeRarity=null){
  const prizes = Array.isArray(state?.currentCase?.prizes) ? state.currentCase.prizes : [];
  const rarity = prizeRarity ? rarityKey(prizeRarity) : null;
  let item = prizes.find((p)=>String(p?.code)===String(prizeKey) && (!rarity || rarityKey(p?.rarity)===rarity));
  if(!item) item = prizes.find((p)=>String(p?.code)===String(prizeKey));
  const images = Array.isArray(item?.images) ? item.images : [];
  return {
    title: keyTitle(prizeKey),
    badge: keyBadge(prizeKey),
    rarity: rarityKey(item?.rarity || prizeRarity || "blue"),
    image: images.length ? pick(images) : "",
  };
}

function launchWinConfetti(count=120){
  const layer = $("winConfettiLayer");
  if(!layer) return;
  layer.innerHTML = "";
  const colors = ["#ff6f61","#6ec3ff","#ffd166","#8ce99a","#d68bff","#ff9f43","#6f86ff","#f06292"];
  for(let i=0;i<count;i++){
    const el = document.createElement("div");
    el.className = `win-confetti${Math.random() < 0.24 ? " streamer" : ""}`;
    el.style.left = `${randint(2,98)}%`;
    el.style.background = colors[randint(0, colors.length - 1)];
    el.style.setProperty("--drift", `${randint(-140,140)}px`);
    el.style.setProperty("--rot", `${randint(120,840)}deg`);
    el.style.setProperty("--dur", `${(1.6 + Math.random()*1.8).toFixed(2)}s`);
    el.style.setProperty("--delay", `${(Math.random()*0.35).toFixed(2)}s`);
    layer.appendChild(el);
    setTimeout(()=>el.remove(), 4200);
  }
}

function clearWinConfetti(){
  const layer = $("winConfettiLayer");
  if(layer) layer.innerHTML = "";
}

function openWinOverlay({ prizeKey="", prizeRarity=null, message="" }){
  const box = $("winOverlay");
  if(!box) return;
  const meta = resolvePrizeForWin(prizeKey, prizeRarity);
  const stamp = $("winPrizeStamp");
  if(stamp){
    stamp.classList.remove("rarity-blue","rarity-purple","rarity-red","rarity-yellow");
    stamp.classList.add(rarityCss(meta.rarity));
  }
  if($("winPrizeImg")){
    $("winPrizeImg").src = meta.image || "/static/prizes/stars_150.svg";
  }
  if($("winPrizeBadge")) $("winPrizeBadge").textContent = meta.badge || "Prize";
  if($("winPrizeValue")) $("winPrizeValue").textContent = meta.title || "MADESIX";
  if($("winPrizeHeading")) $("winPrizeHeading").textContent = meta.title || "Вы выиграли";
  if($("winPrizeDescription")){
    const txt = (message || "").trim() || "Награда начислена. Удача на вашей стороне.";
    $("winPrizeDescription").textContent = txt;
  }

  launchWinConfetti(130);
  openModal("winOverlay");
}

function launchDropFx(count=28){
  const layer=$("fxLayer");
  if(!layer) return;
  for(let i=0;i<count;i++){
    const el=document.createElement("div");
    el.className="fx-star";
    el.style.left=`${randint(2,96)}vw`;
    el.style.top=`${randint(-8,4)}vh`;
    el.style.animationDuration=`${(1.3 + Math.random()*1.2).toFixed(2)}s`;
    const size = randint(4,10);
    el.style.width=`${size}px`;
    el.style.height=`${size}px`;
    el.style.opacity=`${(0.4 + Math.random()*0.6).toFixed(2)}`;
    layer.appendChild(el);
    setTimeout(()=>el.remove(),2600);
  }
}

function clearDropFx(){
  const layer=$("fxLayer");
  if(layer) layer.innerHTML = "";
}

function setupOnlineCounter(){
  const el=$("onlineCount"); if(!el) return;
  const now = new Date();
  const h = now.getHours();
  let base = 8;
  if(h >= 0 && h < 7) base = 4;
  else if(h >= 7 && h < 12) base = 7;
  else if(h >= 12 && h < 18) base = 10;
  else if(h >= 18 && h < 24) base = 13;
  const update=()=>{ el.textContent = String(Math.max(2, base + randint(-2,1))); };
  update();
  setInterval(update, 12000);
}

function setupLiveWinsFeed(){
  const toast=$("liveWinToast");
  const text=$("liveWinText");
  if(!toast || !text) return;
  const names=[
    "mike","lina","ghost","vovan","ninja","sova","astro","max","kira","qwerty","neo","panda",
    "dima","kris","roman","timur","alisa","egor","denis","vlad","sasha","artem","lev","mark",
    "nikita","masha","yarik","igor","stepa","andrey","ilya","vika","yan","polina","danik","tema"
  ];
  const prizes=["Обувь","Толстовка","Скидка 20%","200 Stars","1000 Stars","Сертификат 3000₽","VIP-ключ"];
  const show=()=>{
    // Do not overlap critical UI while modal/spin/win screen is active.
    if(modalOpenCount > 0 || !$("caseSpinModal")?.classList.contains("hidden") || !$("winOverlay")?.classList.contains("hidden")){
      return;
    }
    const n=names[randint(0,names.length-1)];
    const p=prizes[randint(0,prizes.length-1)];
    text.textContent=`${n} выиграл: ${p}`;
    toast.classList.add("show");
    setTimeout(()=>toast.classList.remove("show"), 3600);
  };
  setTimeout(show, 5000);
  const loop=()=>{
    show();
    setTimeout(loop, randint(22000,34000));
  };
  setTimeout(loop, randint(22000,30000));
}

function setupEventBanner(cfg){
  const e = cfg?.event || {};
  if($("eventBannerTitle")) $("eventBannerTitle").textContent = e.title || "MADESIX";
  if($("eventBannerSubtitle")) $("eventBannerSubtitle").textContent = e.subtitle || "Премиальная коллекция";
  if($("eventShopMention")) $("eventShopMention").textContent = e.shop_mention ? `Магазин: ${e.shop_mention}` : "Магазин: MADESIX";
  if($("eventBannerImg") && e.image) $("eventBannerImg").src = e.image;
  if($("eventModalTitle")) $("eventModalTitle").textContent = e.title || "MADESIX";
  if($("eventModalText")) $("eventModalText").textContent = e.text || "Открывайте кейсы и забирайте праздничные награды.";
  if($("eventModalImg") && e.image) $("eventModalImg").src = e.image;
  if($("eventModalAction")) $("eventModalAction").textContent = e.cta_label || "Подписаться";
}

function openPromoLink(url){
  const href = String(url || "").trim();
  if(!href) return;
  try{
    if(tg && href.includes("t.me/") && typeof tg.openTelegramLink === "function"){
      tg.openTelegramLink(href);
      return;
    }
    if(tg && typeof tg.openLink === "function"){
      tg.openLink(href);
      return;
    }
  }catch{}
  window.open(href, "_blank", "noopener,noreferrer");
}

function setupContactButton(cfg){
  const c = cfg?.contact || {};
  const btn = $("contactBtn");
  if(!btn) return;
  const url = (c.url || "").trim();
  const label = (c.label || "").trim() || "Менеджер";
  btn.textContent = label;
  if(url){
    btn.href = url;
    btn.classList.remove("opacity-50","pointer-events-none");
  }else{
    btn.href = "#";
    btn.classList.add("opacity-50","pointer-events-none");
  }
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
  if($("spinBalanceAmount")) $("spinBalanceAmount").textContent=String(balance ?? "—");
  if($("winBalanceAmount")) $("winBalanceAmount").textContent=String(balance ?? "—");
  if($("balance-top")){
    $("balance-top").innerHTML = `${balance ?? "—"} <img src="/static/brand/tg-stars.avif?v=1" alt="Stars" class="inline-block w-4 h-4 stars-logo-inline"/>`;
  }
}

function setTickets(s,b){
  if($("tSneakers")) $("tSneakers").textContent=String(s||0);
  if($("tBracelet")) $("tBracelet").textContent=String(b||0);

  const total=(s||0)+(b||0);
  const vaultChip=$("openVaultChip");
  if(vaultChip){
    if(total>0) vaultChip.classList.add("has-tickets");
    else vaultChip.classList.remove("has-tickets");
  }
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
        <div class="mt-1 text-[11px] ${
          Number(p.left||0)===1 ? "text-white/60" :
          (Number(p.left||0)===2 || Number(p.left||0)===3) ? "text-amber-200" :
          "text-white/60"
        }">
          ${
            Number(p.left||0)===1 ? `Осталось: ${Math.max(0, Number(p.left || 0))}` :
            (Number(p.left||0)===2 || Number(p.left||0)===3) ? `Осталось ${Math.max(0, Number(p.left || 0))}: шанс на тикет повышен` :
            `Осталось: ${Math.max(0, Number(p.left || 0))}`
          }
        </div>
      </div>
    `).join("") : `<div class="text-[11px] text-white/60">Пока нет прогресса. Открывайте кейсы.</div>`;
  }

  const hint = $("ticketSellHint");
  if(hint) hint.textContent = `Выкуп: ${Number(data?.economy?.ticket_sell_percent || 50)}% от стоимости кейса`;
  const lotsBox = $("ticketLotsList");
  if(lotsBox){
    const lots = data.lots || [];
    lotsBox.innerHTML = lots.length ? lots.slice(0,60).map((lot)=>`
      <div class="rounded-2xl bg-black/20 border border-white/10 p-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-extrabold text-sm truncate">${esc(keyTitle(lot.code))}</div>
            <div class="mt-1 flex flex-wrap gap-1">
              <span class="rarity-chip ${rarityCss(lot.rarity)}"><span class="rarity-dot ${rarityCss(lot.rarity)}"></span>${esc(rarityLabel(lot.rarity))}</span>
              <span class="rarity-chip">x${Number(lot.left || 0)}</span>
              ${lot.case_id ? `<span class="rarity-chip">${esc(lot.case_id)} · ${Number(lot.case_cost||0)} Stars</span>` : ``}
            </div>
          </div>
          <button data-sell-tx="${Number(lot.tx_id)}" class="btn rounded-xl bg-emerald-400/15 border border-emerald-200/20 px-3 py-2 text-xs font-extrabold whitespace-nowrap">
            Продать за ${Number(lot.sell_price_total || 0)} Stars
          </button>
        </div>
      </div>
    `).join("") : `<div class="text-[11px] text-white/60">Пока нет тикетов, которые можно продать.</div>`;

    Array.from(lotsBox.querySelectorAll("[data-sell-tx]")).forEach((btn)=>{
      btn.addEventListener("click", async ()=>{
        const txId = parseInt(btn.dataset.sellTx || "0", 10);
        if(!txId) return;
        btn.disabled = true;
        try{
          const res = await api("/api/tickets/sell", { method:"POST", body: JSON.stringify({ tx_id: txId }) });
          setBalance(res.balance);
          setTickets(res.tickets_sneakers, res.tickets_bracelet);
          setMsg(`Тикеты проданы. Начислено ${res.credited} Stars`);
          await loadInventory();
        }catch(e){
          setMsg(`Ошибка продажи: ${e.message || "Ошибка"}`);
          btn.disabled = false;
        }
      });
    });
  }
  return data;
}

function shuffleArray(arr){
  const a = [...arr];
  for(let i=a.length-1; i>0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function collectCaseAssetUrls(caseObj){
  const set = new Set();
  if(caseObj?.avatar) set.add(String(caseObj.avatar));
  for(const p of (caseObj?.prizes || [])){
    for(const u of (p?.images || [])){
      const url = String(u || "").trim();
      if(url) set.add(url);
    }
  }
  return [...set];
}

function probeImageFast(url, timeoutMs=900){
  if(!url) return Promise.resolve(true);
  const prev = CASE_ASSET_STATUS.get(url);
  if(prev === "loaded") return Promise.resolve(true);
  if(prev === "error") return Promise.resolve(false);
  return new Promise((resolve)=>{
    let done = false;
    const img = new Image();
    const finish = (ok, mark=true)=>{
      if(done) return;
      done = true;
      clearTimeout(timer);
      if(mark) CASE_ASSET_STATUS.set(url, ok ? "loaded" : "error");
      resolve(ok);
    };
    img.decoding = "async";
    img.onload = ()=>finish(true, true);
    img.onerror = ()=>finish(false, true);
    const timer = setTimeout(()=>finish(false, false), timeoutMs);
    img.src = url;
  });
}

async function checkCaseAssetsReady(caseObj, timeoutMs=900){
  const urls = collectCaseAssetUrls(caseObj);
  if(!urls.length) return true;
  const rs = await Promise.all(urls.map((u)=>probeImageFast(u, timeoutMs)));
  return rs.every(Boolean);
}

function renderCaseCaptchaChallenge(){
  const targets = shuffleArray(CAPTCHA_CLOTHING_POOL).slice(0,2);
  caseCaptchaTargets = targets.map((x)=>x.code);
  const distractors = shuffleArray(CAPTCHA_DISTRACTOR_POOL).slice(0,4);
  const options = shuffleArray([...targets, ...distractors]);

  const title = $("caseCaptchaTargets");
  const err = $("caseCaptchaError");
  const box = $("caseCaptchaOptions");
  if(title){
    title.textContent = targets.map((x)=>x.label).join(" и ");
  }
  if(err) err.textContent = "";
  if(box){
    box.innerHTML = options.map((x)=>`
      <button type="button" class="case-captcha-option" data-captcha-code="${esc(x.code)}">
        ${esc(x.label)}
      </button>
    `).join("");
    Array.from(box.querySelectorAll("[data-captcha-code]")).forEach((btn)=>{
      btn.addEventListener("click", ()=>{
        btn.classList.toggle("is-selected");
      });
    });
  }
}

function openCaseCaptcha(){
  renderCaseCaptchaChallenge();
  openModal("caseCaptchaModal");
  return new Promise((resolve)=>{
    caseCaptchaResolver = resolve;
  });
}

function closeCaseCaptcha(result=false){
  closeModal("caseCaptchaModal");
  const r = caseCaptchaResolver;
  caseCaptchaResolver = null;
  if(typeof r === "function") r(result);
}

function validateCaseCaptcha(){
  const selected = Array.from(document.querySelectorAll("#caseCaptchaOptions .case-captcha-option.is-selected"))
    .map((x)=>String(x.dataset.captchaCode || ""));
  const err = $("caseCaptchaError");
  const selectedSet = new Set(selected);
  const targetSet = new Set(caseCaptchaTargets);
  const ok = selectedSet.size === targetSet.size && [...targetSet].every((x)=>selectedSet.has(x));
  if(!ok){
    if(err) err.textContent = "Неверно. Выберите именно два товара одежды из условия.";
    return false;
  }
  if(err) err.textContent = "";
  return true;
}

async function openSpinModalGuarded(){
  if(!state.currentCase){
    openResultOverlay({
      badge:"Сначала выбор",
      title:"Кейс не выбран",
      text:"Выберите любой кейс сверху и подтвердите выбор.",
      primary:"Понятно"
    });
    return;
  }
  const ready = await checkCaseAssetsReady(state.currentCase, 900);
  if(!ready){
    const passed = await openCaseCaptcha();
    if(!passed){
      setMsg("Проверка не пройдена.");
      return;
    }
    setMsg("Проверка пройдена. Открываю кейс…");
    checkCaseAssetsReady(state.currentCase, 3500).catch(()=>{});
  }
  await buildReel(state.currentCase.id, "reelModal");
  if($("spinModalTitle")) $("spinModalTitle").textContent = state.currentCase.title || "Кейс";
  openModal("caseSpinModal");
}

function openCasePreview(c){
  const modal=$("casePreviewModal"); if(!modal) return;
  const prizes=Array.isArray(c.prizes) ? [...c.prizes] : [];
  prizes.sort((a,b)=>{
    const rv = rarityValue(b.rarity) - rarityValue(a.rarity);
    if(rv) return rv;
    return (Number(b.weight||0) - Number(a.weight||0));
  });
  const first = prizes[0] || null;
  const thumb=c.avatar || (first ? ((first.images||[])[0] || "") : "");
  $("casePreviewImg").src=thumb || "";
  const previewArt = $("casePreviewArt");
  if(previewArt){
    previewArt.classList.remove("rarity-blue","rarity-purple","rarity-red","rarity-yellow");
    previewArt.classList.add(rarityCss(caseTopRarity(c)));
  }
  $("casePreviewTitle").textContent=c.title || c.id;
  $("casePreviewDesc").textContent=c.desc || "Открой кейс и забери мощный дроп.";
  $("casePreviewPrice").textContent=`${c.cost}`;
  $("casePreviewPrizes").innerHTML = prizes.slice(0,6).map(p=>`<span class="case-tag ${rarityCss(p.rarity)}">${esc(keyTitle(p.code))}</span>`).join("") || `<span class="case-tag">Без призов</span>`;
  const totalWeight = prizes.reduce((s,p)=>s + Math.max(0, Number(p.weight || 0)), 0);
  const box = $("casePreviewItems");
  if(box){
    box.innerHTML = prizes.length ? prizes.map((p)=>{
      const chance = totalWeight > 0 ? ((Math.max(0, Number(p.weight||0)) / totalWeight) * 100) : 0;
      const img = (p.images||[])[0] || "";
      return `
        <div class="rounded-2xl border border-white/10 bg-black/20 p-2 flex items-center gap-3 ${rarityCss(p.rarity)}">
          <div class="case-item-thumb w-14 h-14 rounded-xl overflow-hidden border border-white/10 bg-white/5 shrink-0">
            <div class="case-item-thumb-glow"></div>
            ${img ? `<img src="${img}" class="w-full h-full object-cover"/>` : ``}
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-extrabold text-sm truncate">${esc(keyTitle(p.code))}</div>
            <div class="mt-1 flex flex-wrap gap-1">
              <span class="rarity-chip ${rarityCss(p.rarity)}"><span class="rarity-dot ${rarityCss(p.rarity)}"></span>${esc(rarityLabel(p.rarity))}</span>
              <span class="rarity-chip">${esc(keyBadge(p.code))}</span>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[11px] text-white/60">Шанс</div>
            <div class="font-extrabold text-xs">${chance.toFixed(chance < 1 ? 2 : 1)}%</div>
          </div>
        </div>`;
    }).join("") : `<div class="text-xs text-white/60">В кейсе нет доступных призов.</div>`;
  }
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
  if(idx>=0 && cards[idx]) cards[idx].classList.add("selected");

  if($("roulette-title")) $("roulette-title").textContent=c.title;
  if($("spin-cost")) $("spin-cost").textContent=String(c.cost);
  if($("spinCost")) $("spinCost").textContent=String(c.cost);
  if($("spinCostTitle")) $("spinCostTitle").textContent=String(c.cost);
  if($("spin-cost-inline")) $("spin-cost-inline").textContent=String(c.cost);
  if($("spinCaseLabel")) $("spinCaseLabel").textContent = c.title || c.id;

  const openBtn=$("openSpinModalBtn");
  if(openBtn){
    openBtn.disabled=false;
    openBtn.classList.remove("opacity-50");
    openBtn.classList.add("pulse");
    openBtn.textContent=`Открыть ${c.title}`;
  }
  if($("spinModalTitle")) $("spinModalTitle").textContent=c.title;
  if(!silent){
    setMsg(`Выбран кейс: ${c.title}.`);
    await openSpinModalGuarded();
  }
}

async function buildRouletteGrid(){
  const grid=$("roulette-grid");
  if(!grid) return;

  const cfg = await loadCasesApi();
  state.uiConfig = cfg;
  const list = (cfg.items || []).map((c)=>({
    id: c.id,
    title: c.title || c.id,
    cost: c.spin_cost || 150,
    desc: c.desc || "Выбери кейс и забирай лучший дроп",
    avatar: c.avatar || "",
    prizes: Array.isArray(c.prizes) ? c.prizes : [],
  }));
  state.cases=list;

  grid.innerHTML="";
  for(const c of list){
    const firstPrize = (c.prizes || [])[0];
    const thumb = c.avatar || ((firstPrize?.images || [])[0] || "");
    const frameRarity = caseTopRarity(c);
    const btn=document.createElement("button");
    btn.className=`roulette-card text-left rounded-3xl overflow-hidden relative p-1 ${rarityCss(frameRarity)}`;
    btn.innerHTML=`
      <div class="roulette-case-art">
        ${thumb?`<img src="${thumb}" alt="${esc(c.title)}"/>`:``}
      </div>
      <div class="roulette-case-meta px-1 pb-2">
        <div class="roulette-case-name">${esc(c.title)}</div>
        <div class="roulette-price-pill">${c.cost}</div>
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
  const wrap = reel.parentElement;

  const c = state.cases.find(x=>x.id===rouletteId);
  const prizes = (c?.prizes || []).filter(p => (p.images||[]).length);
  if(!prizes.length){
    reel.innerHTML="";
    return;
  }

  reel.innerHTML="";
  for(let i=0;i<40;i++){
    const prize=prizes[i%prizes.length];
    const key=prize.code;
    const el=document.createElement("div");
    el.className=`prize-card ${rarityCss(prize.rarity)}`;
    el.dataset.key=key;
    el.dataset.rarity=rarityKey(prize.rarity);
    el.innerHTML=`
      <div class="prize-backglow"></div>
      <img class="prize-img" src="${pick(prize.images)}" />
      <div class="prize-overlay"></div>
      <div class="prize-badge">${rarityLabel(prize.rarity)} · ${keyBadge(key)}</div>
      <div class="prize-title">${keyTitle(key)}</div>
    `;
    reel.appendChild(el);
  }
  reel.style.transition="none";
  reel.style.transform="translateY(0px)";
  reel.style.filter="blur(0px) saturate(1)";
  reel.style.willChange="";
  if(wrap) wrap.style.boxShadow="";
}

async function animateToPrize(prizeKey, reelId="reelModal", prizeRarity=null){
  const reel=$(reelId);
  if(!reel) return;
  if(reelAnimRaf){
    cancelAnimationFrame(reelAnimRaf);
    reelAnimRaf = 0;
  }
  const runId = ++reelAnimRunId;
  const items=[...reel.querySelectorAll(".prize-card")];
  if(!items.length) return;

  const cand=[];
  items.forEach((el,i)=>{
    if(el.dataset.key!==prizeKey) return;
    if(prizeRarity && el.dataset.rarity && el.dataset.rarity !== rarityKey(prizeRarity)) return;
    cand.push(i);
  });
  if(!cand.length && prizeRarity){
    items.forEach((el,i)=>{ if(el.dataset.key===prizeKey) cand.push(i); });
  }
  const edgeGuard = 4;
  const safeCand = cand.filter((i)=>i > edgeGuard && i < (items.length - edgeGuard - 1));
  const pool = safeCand.length ? safeCand : cand;
  const targetIndex = pool.length ? pool[Math.floor(Math.random()*pool.length)] : Math.floor(items.length / 2);

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
  reel.style.willChange = "transform, filter";
  items.forEach((el)=>el.classList.remove("is-target"));

  reel.style.transform = `translateY(${startY}px)`;
  reel.style.filter = "blur(0px) saturate(1)";
  let lastY = startY;
  let lastTs = now();

  await new Promise((resolve) => {
    const t0 = now();
    const frame = () => {
      if(runId !== reelAnimRunId){
        reel.style.filter = "blur(0px) saturate(1)";
        reel.style.willChange = "";
        if (wrap) wrap.style.boxShadow = "";
        reelAnimRaf = 0;
        resolve();
        return;
      }
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
        reelAnimRaf = requestAnimationFrame(frame);
      } else {
        reel.style.transform = `translateY(${targetY}px)`;
        reel.style.filter = "blur(0px) saturate(1)";
        reel.style.willChange = "";
        if (wrap) wrap.style.boxShadow = "";
        items.forEach((el)=>el.classList.remove("is-target"));
        targetEl?.classList.add("is-target");
        reelAnimRaf = 0;
        resolve();
      }
    };
    reelAnimRaf = requestAnimationFrame(frame);
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
        <div class="text-xs text-white/70">депозит: ${x.deposit_sum} Stars</div>
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
      setMsg("Оплата прошла. Обновляю баланс…");
      setTimeout(()=>loadMe().catch(()=>{}), 1200);
      openResultOverlay({
        badge:"Успех",
        title:"Баланс пополнен",
        text:`Оплата на ${amount} Stars прошла успешно.`,
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
  setMsg("Запрос на вывод создан.");
  await loadMe();
}

async function doSpin(){
  const btn=$("spinBtn"); if(btn) btn.disabled=true;
  try{
    if(!state.currentCase){
      throw new Error("Сначала выберите кейс");
    }
    setMsg("Крутим…");
    clearDropFx();
    await buildReel(state.rouletteId, "reelModal");
    const res = await api("/api/spin", {
      method:"POST",
      body: JSON.stringify({ roulette_id: state.rouletteId })
    });
    await animateToPrize(res.prize_key, "reelModal", res?.prize?.rarity);

    $("spinResult")?.classList.remove("hidden");
    if($("spinText")) $("spinText").textContent = res.message || "—";

    setBalance(res.balance);
    setTickets(res.tickets_sneakers, res.tickets_bracelet);
    await loadInventory().catch(()=>{});
    setMsg("Готово.");
    launchDropFx(34);
    const spinModal=$("caseSpinModal");
    spinModal?.classList.add("shadow-[0_0_40px_rgba(255,190,95,.35)]");
    setTimeout(()=>spinModal?.classList.remove("shadow-[0_0_40px_rgba(255,190,95,.35)]"), 900);
    spinModal?.classList.add("spin-win-zoom");
    await sleep(260);
    spinModal?.classList.remove("spin-win-zoom");
    openWinOverlay({
      prizeKey: res.prize_key || "",
      prizeRarity: res?.prize?.rarity || null,
      message: res.message || "Результат начислен"
    });
  }catch(e){
    const msg=String(e.message||"Ошибка");
    setMsg(`Ошибка: ${msg}`);
    if(msg.toLowerCase().includes("недостаточно")){
      openResultOverlay({
        badge:"Недостаточно баланса",
        title:"Не хватает Stars",
        text:`Для открытия нужно ${state.rouletteCost} Stars`,
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
    bootSetProgress(0.05, "Запуск интерфейса…");
    initAppLikeViewportLock();
    if(tg){ tg.ready(); tg.expand?.(); }

    bootSetProgress(0.25, "Подключаем данные…");
    await loadCasesApi().catch(()=>null);
    bootSetProgress(0.45, "Готовим интерфейс…");

    $("casePreviewClose")?.addEventListener("click", ()=>closeModal("casePreviewModal"));
    $("caseSpinClose")?.addEventListener("click", ()=>closeModal("caseSpinModal"));
    $("caseSpinCloseFloating")?.addEventListener("click", ()=>closeModal("caseSpinModal"));
    $("ticketVaultClose")?.addEventListener("click", ()=>closeModal("ticketVaultModal"));
    const closeWinOverlay = ()=>{
      closeModal("winOverlay");
      clearWinConfetti();
    };
    $("winOverlayOk")?.addEventListener("click", closeWinOverlay);
    $("winOverlayBack")?.addEventListener("click", closeWinOverlay);
    $("winOverlayMenu")?.addEventListener("click", ()=>{
      closeWinOverlay();
      $("openProfileBtn")?.click();
    });
    $("nativeBackBtn")?.addEventListener("click", ()=>{
      try{
        if(tg && typeof tg.close === "function"){
          tg.close();
          return;
        }
      }catch{}
      if(window.history.length > 1) window.history.back();
    });
    $("nativeMenuBtn")?.addEventListener("click", ()=>{
      $("openProfileBtn")?.click();
    });

    const openVaultPanel = async ()=>{
      await loadInventory().catch(()=>{});
      openModal("ticketVaultModal");
    };
    const openProfilePanel = async ()=>{
      await loadHistory().catch(()=>{});
      await loadMyReferrals().catch(()=>{});
      openModal("profileModal");
    };
    $("openVaultBtn")?.addEventListener("click", openVaultPanel);
    $("openVaultChip")?.addEventListener("click", openVaultPanel);
    $("openProfileBtn")?.addEventListener("click", openProfilePanel);
    $("profileClose")?.addEventListener("click", ()=>closeModal("profileModal"));
    $("btn-roulette-info")?.addEventListener("click", ()=>{
      openResultOverlay({
        badge:"Механика",
        title:"Как работает спин",
        text:"Выберите кейс, откройте спин и дождитесь фиксации центрального слота. Награда начисляется автоматически.",
        primary:"Понятно"
      });
    });
    $("eventBannerBtn")?.addEventListener("click", ()=>openModal("eventModal"));
    $("eventModalClose")?.addEventListener("click", ()=>closeModal("eventModal"));
    $("eventModalAction")?.addEventListener("click", ()=>{
      const e = state?.uiConfig?.event || {};
      const ctaUrl = String(e.cta_url || "").trim();
      if(ctaUrl){
        openPromoLink(ctaUrl);
        closeModal("eventModal");
        setMsg("Открываю Telegram-канал…");
        return;
      }
      closeModal("eventModal");
      openResultOverlay({
        badge:"Ивент",
        title:"Подпишитесь на канал",
        text:"В канале публикуем новые кейсы, акции и промокоды.",
        primary:"Понятно"
      });
    });
    $("openSpinModalBtn")?.addEventListener("click", async ()=>{
      await openSpinModalGuarded();
    });
    $("caseCaptchaClose")?.addEventListener("click", ()=>closeCaseCaptcha(false));
    $("caseCaptchaRefresh")?.addEventListener("click", ()=>renderCaseCaptchaChallenge());
    $("caseCaptchaConfirm")?.addEventListener("click", ()=>{
      if(!validateCaseCaptcha()) return;
      closeCaseCaptcha(true);
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
      if(!Number.isFinite(v) || v < 1000) return setMsg("Минимум для вывода — 1000 Stars.");
      closeModal("withdrawModal");
      await doWithdraw(v).catch(e=>setMsg(e.message));
    });

    $("spinBtn")?.addEventListener("click", ()=>doSpin());

    $("copyRef")?.addEventListener("click", async ()=>{
      const v=$("refLink")?.value || "";
      if(!v || v==="—") return;
      await navigator.clipboard.writeText(v);
      setMsg("Ссылка скопирована");
    });

    bootSetProgress(0.72, "Загружаем кейсы…");
    await buildRouletteGrid();

    $("hitSeasonOpenR1")?.addEventListener("click", async ()=>{
      const target = (state.cases || []).find((x)=>String(x.id)==="r1") || (state.cases || [])[0];
      if(!target){
        setMsg("Кейсы пока не загружены");
        return;
      }
      await selectCase(target, { silent:false });
      $("screen-roulette")?.scrollIntoView({ behavior:"smooth", block:"start" });
      setMsg(`Выбран кейс: ${target.title}`);
    });

    const cfg = state.uiConfig || await loadCasesApi();
    setupProfileIdentity();
    setupEventBanner(cfg);
    setupContactButton(cfg);
    setupOnlineCounter();
    setupLiveWinsFeed();
    bootSetProgress(1, "Готово");
    await sleep(80);
    bootHide();

    await Promise.allSettled([
      loadMe(),
      loadInventory(),
    ]);

  }catch(e){
    bootHide();
    setMsg(`Ошибка: ${e.message}`);
  }
});
