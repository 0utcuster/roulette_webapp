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

let state={ rouletteId:null, rouletteCost:0, currentCase:null, cases:[] };

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
    box.classList.add("hidden");
    if(typeof onPrimary==="function") onPrimary();
  };
  s.onclick=()=>{
    box.classList.add("hidden");
    if(typeof onSecondary==="function") onSecondary();
  };

  box.classList.remove("hidden");
}

function setBalance(balance){
  if($("balance")) $("balance").textContent=String(balance ?? "—");
  if($("balance-top")) $("balance-top").textContent=`${balance ?? "—"}⭐`;
}

function setTickets(s,b){
  if($("tSneakers")) $("tSneakers").textContent=String(s||0);
  if($("tBracelet")) $("tBracelet").textContent=String(b||0);
  if($("cabSneakers")) $("cabSneakers").textContent=String(s||0);
  if($("cabBracelet")) $("cabBracelet").textContent=String(b||0);

  const bs=$("barSneakers"); if(bs) bs.style.width=`${Math.min(100,(s||0)/10*100)}%`;
  const bb=$("barBracelet"); if(bb) bb.style.width=`${Math.min(100,(b||0)/5*100)}%`;

  const rs=$("reqSneakers"); if(rs) rs.disabled=(s||0)<10;
  const rb=$("reqBracelet"); if(rb) rb.disabled=(b||0)<5;
}

function showScreen(which){
  const r=$("screen-roulette");
  const c=$("screen-cabinet");
  if(!r || !c) return;

  const nr=$("navRoulette");
  const nc=$("navCabinet");

  if(which==="cabinet"){
    r.classList.add("hidden");
    c.classList.remove("hidden");
    if(nc){
      nc.classList.add("bg-white","text-black");
      nc.classList.remove("bg-white/10","border","border-white/15");
    }
    if(nr){
      nr.classList.remove("bg-white","text-black");
      nr.classList.add("bg-white/10","border","border-white/15");
    }
  }else{
    c.classList.add("hidden");
    r.classList.remove("hidden");
    if(nr){
      nr.classList.add("bg-white","text-black");
      nr.classList.remove("bg-white/10","border","border-white/15");
    }
    if(nc){
      nc.classList.remove("bg-white","text-black");
      nc.classList.add("bg-white/10","border","border-white/15");
    }
  }
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
    modal.classList.add("hidden");
  };
  modal.classList.remove("hidden");
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
    $("caseSpinModal")?.classList.remove("hidden");
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

  const containerHeight=reel.parentElement.clientHeight;
  const itemHeight=items[0].getBoundingClientRect().height;
  const gap=12;

  const yCenter=targetIndex*(itemHeight+gap)+itemHeight/2;
  const targetY=containerHeight/2 - yCenter;

  reel.style.transition="transform 1200ms cubic-bezier(.12,.84,.2,1)";
  reel.style.transform=`translateY(${Math.floor(targetY-18)}px)`;
  await sleep(1220);

  reel.style.transition="transform 380ms cubic-bezier(.2,1.2,.25,1)";
  reel.style.transform=`translateY(${Math.floor(targetY)}px)`;
  await sleep(420);
}

async function loadMe(){
  const me=await api("/api/me", { method:"GET" });
  setBalance(me.balance);
  setTickets(me.tickets_sneakers, me.tickets_bracelet);

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

function openModal(id){
  const m=$(id);
  if(m) m.classList.remove("hidden");
}
function closeModal(id){
  const m=$(id);
  if(m) m.classList.add("hidden");
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
    const res = await api("/api/spin", {
      method:"POST",
      body: JSON.stringify({ roulette_id: state.rouletteId })
    });
    await animateToPrize(res.prize_key, "reelModal");

    $("spinResult")?.classList.remove("hidden");
    if($("spinText")) $("spinText").textContent = res.message || "—";

    setBalance(res.balance);
    setTickets(res.tickets_sneakers, res.tickets_bracelet);
    setMsg("✅ Готово!");
    openResultOverlay({
      badge:"Выигрыш",
      title:keyTitle(res.prize_key || ""),
      text:res.message || "Результат начислен",
      primary:"Забрать",
      onPrimary:()=>{$("caseSpinModal")?.classList.add("hidden");}
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

async function reqPrize(type){
  await api("/api/prize/request", { method:"POST", body: JSON.stringify({ prize_type:type }) });
  setMsg("✅ Заявка отправлена.");
  await loadMe();
}

document.addEventListener("DOMContentLoaded", async ()=>{
  try{
    if(tg){ tg.ready(); tg.expand?.(); }

    $("casePreviewClose")?.addEventListener("click", ()=>$("casePreviewModal")?.classList.add("hidden"));
    $("caseSpinClose")?.addEventListener("click", ()=>$("caseSpinModal")?.classList.add("hidden"));
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
      $("caseSpinModal")?.classList.remove("hidden");
    });

    $("navRoulette")?.addEventListener("click", ()=>{
      localStorage.setItem("tab","roulette");
      showScreen("roulette");
    });
    $("navCabinet")?.addEventListener("click", ()=>{
      localStorage.setItem("tab","cabinet");
      showScreen("cabinet");
      loadHistory().catch(()=>{});
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
    $("reqSneakers")?.addEventListener("click", ()=>reqPrize("sneakers").catch(e=>setMsg(e.message)));
    $("reqBracelet")?.addEventListener("click", ()=>reqPrize("bracelet").catch(e=>setMsg(e.message)));

    $("copyRef")?.addEventListener("click", async ()=>{
      const v=$("refLink")?.value || "";
      if(!v || v==="—") return;
      await navigator.clipboard.writeText(v);
      setMsg("Ссылка скопирована ✅");
    });

    await buildRouletteGrid();
    await loadMe();

    const last = localStorage.getItem("tab") || "roulette";
    showScreen(last);
    if(last==="cabinet") loadHistory().catch(()=>{});

  }catch(e){
    setMsg(`Ошибка: ${e.message}`);
  }
});
