/**
 * js/customer.js
 * 居酒屋みどり亭 MOS — お客様画面ロジック
 */

"use strict";

(function() {
  const M = window.MOS;

  // ─── State ───────────────────────────────────────
  let tableNo   = "";
  let guests    = 2;
  let courseId  = null;
  let entryTs   = null;
  let cart      = {};        // { itemId: qty }
  let history   = [];        // 注文履歴（API送信ステータス付き）
  let timerInt  = null;

  // ─── DOM refs ────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const screens = {
    qr:      $("screenQr"),
    guest:   $("screenGuest"),
    course:  $("screenCourse"),
    menu:    $("screenMenu"),
    history: $("screenHistory"),
  };
  const wzbar      = $("wzbar");
  const wzRow      = $("wzRow");
  const gnav       = $("gnav");
  const btnReset   = $("btnReset");

  // ─── 画面切替 ────────────────────────────────────
  function showScreen(key) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[key].classList.add("active");

    const isOnboard = ["qr","guest","course"].includes(key);
    wzbar.classList.toggle("hidden", !isOnboard);
    if (isOnboard) renderWizard(key);

    btnReset.classList.toggle("hidden", key === "qr");
    $("btnShowHistory").classList.toggle("hidden", key !== "menu" && key !== "history");
  }

  // ─── ウィザードバー ───────────────────────────────
  const WZ_STEPS = ["QR読取","人数","コース","注文"];
  const WZ_KEYS  = ["qr","guest","course","menu"];
  function renderWizard(currentKey) {
    const ci = WZ_KEYS.indexOf(currentKey);
    wzRow.innerHTML = "";
    WZ_STEPS.forEach((lbl, i) => {
      const state = i < ci ? "done" : i === ci ? "active" : "idle";
      const stepEl = document.createElement("div");
      stepEl.className = "wz-step";
      stepEl.innerHTML = `
        <div class="wz-inner">
          <div class="wz-dot ${state}">${state === "done" ? "✓" : i+1}</div>
          <div class="wz-lbl ${state}">${lbl}</div>
        </div>
        ${i < WZ_STEPS.length-1 ? `<div class="wz-line ${i < ci ? "done" : ""}"></div>` : ""}
      `;
      wzRow.appendChild(stepEl);
    });
  }

  // ─── トースト ─────────────────────────────────────
  function showToast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(el._tid);
    el._tid = setTimeout(() => el.classList.add("hidden"), 3200);
  }

  // ─────────────────────────────────────────────────
  // STEP 0: QRスキャン
  // ─────────────────────────────────────────────────
  $("btnScan").addEventListener("click", function() {
    const em = $("qrEmoji");
    em.textContent = "⏳";
    this.disabled = true;
    this.textContent = "読み取り中...";
    setTimeout(() => {
      tableNo  = "1F-1";
      entryTs  = Date.now();
      em.textContent = "📷";
      this.disabled = false;
      this.textContent = "📷 QRコードを読み取る（デモ）";
      renderGuestScreen();
      showScreen("guest");
    }, 1800);
  });

  // ─────────────────────────────────────────────────
  // STEP 1: 人数入力
  // ─────────────────────────────────────────────────
  function renderGuestScreen() {
    $("guestTableCard").innerHTML = `
      <div class="tc-em">🪑</div>
      <div>
        <div class="tc-name">${tableNo}番テーブル</div>
        <div class="tc-sub">QRコード認証済み ✓</div>
      </div>`;
    updateGuestUI();
  }
  function updateGuestUI() {
    $("guestVal").textContent = guests;
    $("btnGuestMinus").disabled = guests <= 1;
    $("btnGuestPlus").disabled  = guests >= 40;
  }
  $("btnGuestMinus").addEventListener("click", () => { guests = Math.max(1,  guests-1); updateGuestUI(); });
  $("btnGuestPlus").addEventListener("click",  () => { guests = Math.min(40, guests+1); updateGuestUI(); });
  $("btnGuestNext").addEventListener("click",  () => { renderCourseScreen(); showScreen("course"); });

  // ─────────────────────────────────────────────────
  // STEP 2: コース選択
  // ─────────────────────────────────────────────────
  function renderCourseScreen() {
    $("courseSubtitle").textContent = `${guests}名様｜ご希望のコースをお選びください`;
    const list = $("courseList");
    list.innerHTML = "";
    M.COURSES.forEach(c => {
      const el = document.createElement("div");
      el.className = "crs-card";
      el.dataset.id = c.id;
      const priceStr = c.price === 0
        ? `<span class="crs-price" style="color:#5c6e3a">無料</span>`
        : `<span class="crs-price" style="color:${c.color}">¥${c.price.toLocaleString()}</span>
           <span class="crs-pu">/ 1名（税込）</span>
           ${c.minutes ? `<span class="crs-time">⏱ ${c.minutes}分</span>` : ""}`;
      const incHtml = c.includes.length > 0 ? `
        <div class="crs-inc">
          <div class="crs-inc-title">含まれるドリンク</div>
          <ul class="crs-chips">${c.includes.map(x => `<li class="crs-chip">${x}</li>`).join("")}</ul>
        </div>` : "";
      el.innerHTML = `
        <div class="crs-top">
          <div class="crs-em">${c.emoji}</div>
          <div class="crs-body">
            <div class="crs-nrow">
              <span class="crs-name">${c.label}</span>
              ${c.badge ? `<span class="crs-bge" style="background:${c.color}">${c.badge}</span>` : ""}
            </div>
            <div class="crs-desc">${c.desc}</div>
            <div class="crs-prow">${priceStr}</div>
          </div>
          <div class="crs-chk" id="chk_${c.id}"></div>
        </div>${incHtml}`;
      el.addEventListener("click", () => selectCourse(c.id));
      list.appendChild(el);
    });
    updateCourseUI();
  }
  function selectCourse(id) {
    courseId = id;
    updateCourseUI();
  }
  function updateCourseUI() {
    M.COURSES.forEach(c => {
      const el = document.querySelector(`.crs-card[data-id="${c.id}"]`);
      const chk = $(`chk_${c.id}`);
      if (!el || !chk) return;
      const sel = courseId === c.id;
      el.classList.toggle("sel", sel);
      el.style.borderColor = sel ? c.color : "";
      chk.textContent = sel ? "✓" : "";
      chk.style.background   = sel ? c.color : "";
      chk.style.borderColor  = sel ? c.color : "";
      chk.style.color        = sel ? "#fff"  : "";
    });
    const btn = $("btnCourseNext");
    btn.disabled   = !courseId;
    btn.textContent = courseId ? "注文画面へ進む →" : "コースを選択してください";
  }
  $("btnCourseNext").addEventListener("click", () => {
    if (!courseId) return;
    renderMenuScreen();
    showScreen("menu");
  });

  // ─────────────────────────────────────────────────
  // STEP 3: メニュー画面
  // ─────────────────────────────────────────────────
  let activeCat = "おすすめ";

  function renderMenuScreen() {
    renderInfoBar();
    renderCatBar();
    renderMenuList(activeCat);
    startTimer();
    updateBotNav();
  }

  function renderInfoBar() {
    const c  = M.getCourse(courseId);
    const cf = c ? c.price * guests : 0;
    const entryTime = entryTs ? M.fmtTime(new Date(entryTs)) : "--:--";
    $("infoBar").innerHTML = `
      <div class="ib-l">
        <div class="ib-tbl">🪑 ${tableNo}番テーブル　${guests}名様</div>
        <div class="ib-sub">入店 ${entryTime} | 緑橋一号店</div>
        ${c ? `<span class="ib-pill" style="background:${c.color}">${c.emoji} ${c.shortLabel}${c.price > 0 ? `　¥${cf.toLocaleString()}` : ""}</span>` : ""}
      </div>
      <div class="ib-r" id="ibTimer"></div>`;

    const isNomi = courseId !== "alacarte";
    const dp = $("drinkPromo");
    dp.classList.toggle("hidden", !isNomi);
    if (isNomi && c) {
      $("drinkPromoTxt").textContent = `${c.label}中！ドリンクタブから飲み放題メニューをご注文いただけます`;
    }
  }

  function startTimer() {
    if (timerInt) clearInterval(timerInt);
    const c = M.getCourse(courseId);
    if (!c || !c.minutes || !entryTs) return;
    function tick() {
      const elapsed = Math.floor((Date.now() - entryTs) / 60000);
      const rem = Math.max(0, c.minutes - elapsed);
      const el = $("ibTimer");
      if (!el) return;
      el.innerHTML = `
        <div class="ib-timer" style="color:${rem <= 30 ? "#fca5a5" : "var(--orl)"}">${rem}分</div>
        <div class="ib-tlbl">残り時間</div>`;
      const lo = $("loBar");
      if (rem <= 30) {
        lo.classList.remove("hidden");
        $("loTxt").textContent = `ラストオーダーです（残り${rem}分）`;
      } else {
        lo.classList.add("hidden");
      }
    }
    tick();
    timerInt = setInterval(tick, 30000);
  }

  function renderCatBar() {
    const bar = $("catBar");
    bar.innerHTML = "";
    const isNomi = courseId !== "alacarte";
    M.CATEGORIES.forEach(cat => {
      const btn = document.createElement("button");
      btn.className = `cat-tab${cat.key === activeCat ? " on" : ""}`;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", cat.key === activeCat);
      const dot = (cat.type === "drink" && isNomi)
        ? `<span class="drink-dot">放題</span>` : "";
      btn.innerHTML = `<span class="ct-em">${cat.emoji}</span><span class="ct-lbl">${cat.label}</span>${dot}`;
      btn.addEventListener("click", () => {
        activeCat = cat.key;
        renderCatBar();
        renderMenuList(cat.key);
      });
      bar.appendChild(btn);
    });
  }

  function renderMenuList(catKey) {
    const list = $("menuList");
    list.innerHTML = "";
    const isNomi = courseId !== "alacarte";
    if (catKey === "ドリンク" && isNomi) {
      const lbl = document.createElement("div");
      lbl.className = "sec-lbl";
      lbl.textContent = "🍺 飲み放題対象メニュー";
      list.appendChild(lbl);
    }
    (M.MENU[catKey] || []).forEach(item => {
      const qty = cart[item.id] || 0;
      const el  = document.createElement("div");
      el.className = `mcard${qty > 0 ? " ic" : ""}`;
      el.dataset.id = item.id;
      const tagHtml = item.tag
        ? `<span class="mc-tag" style="background:${item.tag === "人気" ? "#e8621a" : "#5c6e3a"}">${item.tag}</span>` : "";
      const priceHtml = item.price === 0
        ? `<div class="mc-price free">無料</div>`
        : `<div class="mc-price">¥${item.price.toLocaleString()}</div>`;
      const qcHtml = qty > 0
        ? `<button class="mc-qb dec" data-id="${item.id}" aria-label="減らす">−</button>
           <span class="mc-qn">${qty}</span>`
        : "";
      el.innerHTML = `
        <div class="mc-em">${item.emoji}</div>
        <div class="mc-body">
          <div class="mc-nr"><span class="mc-name">${item.name}</span>${tagHtml}</div>
          <div class="mc-desc">${item.desc}</div>
          ${priceHtml}
        </div>
        <div class="mc-qc">
          ${qcHtml}
          <button class="mc-qb inc" data-id="${item.id}" aria-label="増やす">＋</button>
        </div>`;
      list.appendChild(el);
    });
    // 注文済みサマリー
    if (history.length > 0 && catKey === "おすすめ") {
      const sum = document.createElement("div");
      sum.style.cssText = "background:#fff;border-radius:var(--r2);padding:11px 13px;border:1.5px solid var(--bd2);margin-top:8px;";
      sum.innerHTML = `<div style="font-size:.65rem;font-weight:700;color:var(--ts);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">✅ 注文済み（${history.length}回）</div>` +
        history.flatMap(h => h.items).map(it =>
          `<div style="font-size:.78rem;color:var(--tm);padding:3px 0;border-bottom:1px dashed var(--bd2)">${it.name} × ${it.qty}</div>`
        ).join("");
      list.appendChild(sum);
    }
    // イベント委譲
    list.addEventListener("click", handleMenuClick, { once: true });
  }

  function handleMenuClick(e) {
    const inc = e.target.closest(".inc");
    const dec = e.target.closest(".dec");
    if (inc) { updCart(Number(inc.dataset.id), 1); }
    if (dec) { updCart(Number(dec.dataset.id), -1); }
  }

  function updCart(id, delta) {
    cart[id] = Math.max(0, (cart[id] || 0) + delta);
    if (cart[id] === 0) delete cart[id];
    renderMenuList(activeCat);
    updateBotNav();
  }

  function updateBotNav() {
    const cnt = Object.values(cart).reduce((s, q) => s + q, 0);
    const btn = $("btnOpenCart");
    btn.disabled = cnt === 0;
    btn.innerHTML = cnt > 0
      ? `🛒 カートを見る <span style="background:#fff;color:var(--or);border-radius:50%;width:18px;height:18px;font-size:.62rem;font-weight:900;display:inline-flex;align-items:center;justify-content:center;">${cnt}</span>`
      : "🛒 カートを見る";
  }

  // ─────────────────────────────────────────────────
  // カートドロワー
  // ─────────────────────────────────────────────────
  $("btnOpenCart").addEventListener("click", openCart);
  $("btnCloseCart").addEventListener("click", closeCart);
  $("cartOverlay").addEventListener("click", e => { if (e.target === $("cartOverlay")) closeCart(); });

  function openCart() { renderCart(); $("cartOverlay").classList.remove("hidden"); }
  function closeCart() { $("cartOverlay").classList.add("hidden"); }

  function renderCart() {
    const c    = M.getCourse(courseId);
    const cf   = c ? c.price * guests : 0;
    const entries = Object.entries(cart).filter(([, q]) => q > 0);
    const itemTot = entries.reduce((s, [id, q]) => s + (M.getItem(id)?.price || 0) * q, 0);
    const total   = cf + itemTot;

    // コースバナー
    let html = "";
    if (c) {
      html += `<div class="crs-banner">
        <div class="cb-em">${c.emoji}</div>
        <div class="cb-body">
          <div class="cb-lbl">選択中のコース</div>
          <div class="cb-name">${c.label}</div>
          <div class="cb-det">${guests}名 × ${c.price === 0 ? "無料" : `¥${c.price.toLocaleString()}`}</div>
        </div>
        <div class="cb-price">${c.price === 0 ? "¥0" : `¥${cf.toLocaleString()}`}</div>
      </div>`;
    }
    // アイテム
    if (entries.length === 0) {
      html += `<div class="cart-empty"><div class="cem">🍽️</div><p>メニューから商品を選んでください</p></div>`;
    } else {
      entries.forEach(([id, qty]) => {
        const m = M.getItem(id);
        if (!m) return;
        html += `<div class="cart-item">
          <div class="ci-em">${m.emoji}</div>
          <div class="ci-body">
            <div class="ci-name">${m.name}</div>
            <div class="ci-unit">${m.price === 0 ? "無料" : `¥${m.price.toLocaleString()} × ${qty}`}</div>
            <div class="ci-sub">${m.price === 0 ? "¥0" : `¥${(m.price*qty).toLocaleString()}`}</div>
          </div>
          <div class="ci-ctrl">
            <button class="ci-btn del" data-id="${id}" data-all="1" aria-label="削除">🗑</button>
            <button class="ci-btn"     data-id="${id}" data-d="-1"  aria-label="減らす">−</button>
            <span class="ci-num">${qty}</span>
            <button class="ci-btn"     data-id="${id}" data-d="1"   aria-label="増やす">＋</button>
          </div>
        </div>`;
      });
    }
    $("cartItems").innerHTML = html;
    $("cartTotal").textContent = `¥${total.toLocaleString()}`;
    $("cartBreakdown").innerHTML = entries.length > 0
      ? `<span>コース ¥${cf.toLocaleString()}</span><span>料理・ドリンク ¥${itemTot.toLocaleString()}</span>` : "";
    const btnOrd = $("btnOrder");
    btnOrd.disabled   = entries.length === 0;
    btnOrd.textContent = entries.length === 0 ? "商品を選んでください"
      : `${Object.values(cart).reduce((s,q)=>s+q,0)}品を注文する →`;

    // イベント委譲
    $("cartItems").addEventListener("click", e => {
      const btn = e.target.closest(".ci-btn");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.all) { updCart(id, -999); }
      else { updCart(id, Number(btn.dataset.d)); }
      renderCart();
    });
  }

  // ─────────────────────────────────────────────────
  // 注文確定
  // ─────────────────────────────────────────────────
  $("btnOrder").addEventListener("click", placeOrder);

  async function placeOrder() {
    const entries = Object.entries(cart).filter(([, q]) => q > 0);
    if (entries.length === 0) return;

    const $btn = $("btnOrder");
    $btn.disabled = true;
    $btn.textContent = "送信中...";

    const items = entries.map(([id, qty]) => {
      const m = M.getItem(id);
      return { name: m.name, price: m.price, qty, served: 0 };
    });

    const order = {
      id:       M.nextOid(),
      customerId: "0000099",
      tableNo,
      guests,
      courseId,
      entryTime: M.fmtTime(new Date(entryTs)),
      status:    1,
      items,
      apiStatus: "pending",
      orderedAt: new Date().toISOString(),
    };

    // API送信（ver2.1.0: getOrders はオブジェクト形式）
    const payload = M.buildGetOrdersReq({ customerId: "0000099", billStatus: 1 });
    try {
      const res = await M.apiPost(payload);
      order.apiStatus = res.ok ? "ok" : "ng";
    } catch {
      order.apiStatus = "ng";
    }

    history.unshift(order);
    cart = {};

    closeCart();
    renderMenuList(activeCat);
    updateBotNav();

    // 完了オーバーレイ
    $("doneOverlay").classList.remove("hidden");
    $btn.disabled = false;
  }

  $("btnDoneCont").addEventListener("click",  () => $("doneOverlay").classList.add("hidden"));
  $("btnDoneClose").addEventListener("click", () => $("doneOverlay").classList.add("hidden"));

  // ─────────────────────────────────────────────────
  // 注文履歴
  // ─────────────────────────────────────────────────
  $("btnNavHistory").addEventListener("click",    openHistory);
  $("btnShowHistory").addEventListener("click",   openHistory);
  $("btnHistBack").addEventListener("click",      () => showScreen("menu"));
  $("btnNavMenuFromHist").addEventListener("click", () => showScreen("menu"));
  $("btnNavMenu").addEventListener("click",       () => showScreen("menu"));

  function openHistory() {
    renderHistoryScreen();
    showScreen("history");
  }

  function renderHistoryScreen() {
    const c  = M.getCourse(courseId);
    const cf = c ? c.price * guests : 0;
    const itemTot = history.reduce((s, h) => s + h.items.reduce((ss, it) => ss + it.price * it.qty, 0), 0);
    const total   = cf + itemTot;

    $("histSub").textContent = `${history.length}回の注文`;

    let html = "";
    if (history.length > 0) {
      html += `<div class="hist-summary">
        <div>
          <div class="hs-sum-l">本日の合計（税込）</div>
          <div class="hs-sum-val">¥${total.toLocaleString()}</div>
          <div class="hs-sum-sub">${c && c.price > 0 ? `コース ¥${cf.toLocaleString()} + ` : ""}料理・ドリンク ¥${itemTot.toLocaleString()}</div>
        </div>
        ${c ? `<span style="font-size:.68rem;font-weight:700;padding:4px 10px;border-radius:20px;background:${c.color};color:#fff">${c.emoji} ${c.shortLabel}</span>` : ""}
      </div>`;
    }

    if (history.length === 0) {
      html += `<div style="text-align:center;padding:48px 20px;color:var(--ts)">
        <div style="font-size:3rem;margin-bottom:10px">🍽️</div>
        <p style="font-size:.83rem">まだ注文がありません<br>メニューからご注文ください</p>
      </div>`;
    } else {
      history.forEach((ord, i) => {
        const bs     = MOS.BILL_STATUS[ord.status];
        const ordTot = ord.items.reduce((s, it) => s + it.price * it.qty, 0);
        const ordTime = ord.orderedAt ? new Date(ord.orderedAt).toTimeString().slice(0,5) : ord.entryTime;
        const apiHtml = {
          ok:      `<div class="api-status ok">● API送信済み</div>`,
          ng:      `<div class="api-status ng">● 送信失敗</div>`,
          pending: `<div class="api-status pending">● 送信中…</div>`,
        }[ord.apiStatus] || "";
        html += `<div class="hist-session">
          <div class="hs-header">
            <div class="hs-h-l">
              <div class="hs-time">注文 ${i+1}回目　${ordTime}</div>
              <div class="hs-meta">
                <span class="hs-sbadge" style="background:${bs?.color || "#22c55e"}">${bs?.label || "受付中"}</span>
                <span style="font-size:.65rem;color:var(--ts)">${ord.items.length}品</span>
              </div>
            </div>${apiHtml}
          </div>
          <div class="hs-items">
            ${ord.items.map(it => `
              <div class="hs-row">
                <span class="hs-name">${it.name}</span>
                <span class="hs-qty">× ${it.qty}</span>
                <span class="hs-price">${it.price === 0 ? "無料" : `¥${(it.price*it.qty).toLocaleString()}`}</span>
                <div class="hs-served${it.served >= it.qty ? " ok" : ""}">${it.served >= it.qty ? "✓" : ""}</div>
              </div>`).join("")}
          </div>
          <div class="hs-footer">
            <div class="hs-total">小計 ¥${ordTot.toLocaleString()}</div>
            <div style="font-size:.64rem;color:var(--ts)">ID: ${ord.id}</div>
          </div>
        </div>`;
      });
    }
    $("histBody").innerHTML = html;
  }

  // ─────────────────────────────────────────────────
  // スタッフ呼び出し
  // ─────────────────────────────────────────────────
  function callStaff() { showToast(`🔔 スタッフを呼び出しました（卓: ${tableNo}）`); }
  document.querySelectorAll("[id^='btnCallStaff']").forEach(b => b.addEventListener("click", callStaff));
  $("btnCallStaffHist").addEventListener("click", callStaff);

  // ─────────────────────────────────────────────────
  // デモリセット
  // ─────────────────────────────────────────────────
  $("btnReset").addEventListener("click", () => {
    tableNo = ""; guests = 2; courseId = null; entryTs = null;
    cart = {}; history = [];
    if (timerInt) clearInterval(timerInt);
    showScreen("qr");
  });

  // ─────────────────────────────────────────────────
  // 初期化
  // ─────────────────────────────────────────────────
  showScreen("qr");

})();
