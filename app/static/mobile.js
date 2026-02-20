const tg = window.Telegram?.WebApp || null;

function $(id){ return document.getElementById(id); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

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
    ticket_sneakers:"👟 Кроссовки",
    ticket_bracelet:"📿 Браслет",
    discount_10:"💸 10%",
    discount_20:"💸 20%",
    discount_50:"💸 50%",
    stars_150:"⭐ 150",
    stars_500:"⭐ 500",
    stars_1000:"⭐ 1000",
  };
  return m[key] || key;
}
function keyBadge(key){
  if(key.startsWith("ticket_")) return "Главный приз";
  if(key.startsWith("discount_")) return "Скидка";
  return "Stars";
}
const ORDER=["ticket_sneakers","ticket_bracelet","discount_10","discount_20","discount_50","stars_150","stars_500","stars_1000"];

let state={ rouletteId:"r1", rouletteCost:150 };

function setMsg(text){ const el=$("msg"); if(el) el.textContent=text||"—"; }
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

async function buildRouletteGrid(){
  const grid=$("roulette-grid");
  if(!grid) return;

  const imgs=await loadRouletteImages();
  const list=Object.keys(imgs.roulettes||{}).map(id=>({
    id,
    title: imgs.roulettes[id].title||id,
    cost: imgs.roulettes[id].spin_cost||150,
    items: imgs.roulettes[id].items||{}
  }));

  grid.innerHTML="";
  for(const r of list){
    const items=r.items;
    const thumb=(items.ticket_sneakers && items.ticket_sneakers[0]) ||
                (items.ticket_bracelet && items.ticket_bracelet[0]) ||
                (items.stars_150 && items.stars_150[0]) || "";

    const btn=document.createElement("button");
    btn.className="roulette-card text-left rounded-3xl border border-white/15 bg-white/5 overflow-hidden relative";
    btn.innerHTML=`
      <div class="relative p-3">
        <div class="flex items-center gap-3">
          <div class="w-12 h-16 rounded-2xl overflow-hidden border border-white/15 bg-black/20">
            ${thumb?`<img src="${thumb}" class="w-full h-full object-cover"/>`:``}
          </div>
          <div class="min-w-0">
            <div class="text-sm font-black truncate">${r.title}</div>
            <div class="text-xs font-bold text-white/60">${r.cost}⭐ за спин</div>
          </div>
        </div>
      </div>
    `;
    btn.addEventListener("click", async ()=>{
      state.rouletteId=r.id;
      state.rouletteCost=r.cost;

      document.querySelectorAll(".roulette-card").forEach(x=>x.classList.remove("ring-2","ring-white/40"));
      btn.classList.add("ring-2","ring-white/40");

      if($("roulette-title")) $("roulette-title").textContent=r.title;
      if($("spin-cost")) $("spin-cost").textContent=String(r.cost);
      if($("spinCost")) $("spinCost").textContent=String(r.cost);
      if($("spinCostTitle")) $("spinCostTitle").textContent=String(r.cost);
      if($("spin-cost-inline")) $("spin-cost-inline").textContent=String(r.cost);

      await buildReel(r.id);
    });

    grid.appendChild(btn);
  }

  grid.firstElementChild?.click();
}

async function buildReel(rouletteId){
  const reel=$("reel"); if(!reel) return;

  const imgs=await loadRouletteImages();
  const itemsMap=imgs.roulettes?.[rouletteId]?.items||{};
  const keys=ORDER.filter(k=>itemsMap[k] && itemsMap[k].length);

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

async function animateToPrize(prizeKey){
  const reel=$("reel");
  const items=[...reel.querySelectorAll(".prize-card")];
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

// ---------- MODALS (amount input) ----------
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
    }else setMsg("Платёж не завершён.");
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
    setMsg("Крутим…");
    const res = await api("/api/spin", {
      method:"POST",
      body: JSON.stringify({ roulette_id: state.rouletteId })
    });
    await animateToPrize(res.prize_key);

    $("spinResult")?.classList.remove("hidden");
    if($("spinText")) $("spinText").textContent = res.message || "—";

    setBalance(res.balance);
    setTickets(res.tickets_sneakers, res.tickets_bracelet);
    setMsg("✅ Готово!");
  }catch(e){
    setMsg(`Ошибка: ${e.message}`);
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

    // Tabs
    $("navRoulette")?.addEventListener("click", ()=>{
      localStorage.setItem("tab","roulette");
      showScreen("roulette");
    });
    $("navCabinet")?.addEventListener("click", ()=>{
      localStorage.setItem("tab","cabinet");
      showScreen("cabinet");
      loadHistory().catch(()=>{});
    });

    // Deposit modal
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

    // Withdraw modal
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

    // Spin & prizes
    $("spinBtn")?.addEventListener("click", ()=>doSpin());
    $("reqSneakers")?.addEventListener("click", ()=>reqPrize("sneakers").catch(e=>setMsg(e.message)));
    $("reqBracelet")?.addEventListener("click", ()=>reqPrize("bracelet").catch(e=>setMsg(e.message)));

    // Copy ref
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
