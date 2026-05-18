/**
 * js/customer.js
 * 居酒屋みどり亭 MOS — お客様画面ロジック
 * 修正: スタッフ呼び出し削除 / イベント委譲修正 / コース画面に戻るボタン / API送信修正
 */

"use strict";

// data.js・api.js のロード完了後に実行
window.addEventListener("DOMContentLoaded", function() {
  const M = window.MOS;
  if (!M) { console.error("MOS data.js が読み込まれていません"); return; }

  // ─── State ───────────────────────────────────────
  let tableNo   = "";
  let guests    = 2;
  let courseId  = null;
  let entryTs   = null;
  let cart      = {};
  let history   = [];
  let timerInt  = null;
  let activeCat = "おすすめ";
  let checkoutRequest = null;
  let checkoutLockPending = false;
  let sessionBillStatus = 1;
  let checkoutWatchTimer = null;
  const DEMO_CUSTOMER_ID = "0000099";
  const STORE_ID = "AA";

  // ─── DOM helper ──────────────────────────────────
  const $ = (id) => document.getElementById(id);

  // ─── 画面切替 ────────────────────────────────────
  const SCREEN_IDS = ["screenQr","screenGuest","screenCourse","screenMenu","screenHistory","screenOrderSummary"];
  function isOrderingLocked() {
    return checkoutLockPending || !!checkoutRequest || [2, 4, 8].includes(sessionBillStatus);
  }
  function showScreen(id) {
    if (isOrderingLocked() && !["screenQr", "screenOrderSummary"].includes(id)) {
      id = "screenOrderSummary";
    }
    SCREEN_IDS.forEach(sid => {
      const el = $(sid);
      if (el) el.classList.toggle("active", el.id === id);
    });
    const isOnboard = ["screenQr","screenGuest","screenCourse"].includes(id);
    $("wzbar").classList.toggle("hidden", !isOnboard);
    if (isOnboard) renderWizard(id);
    $("btnReset").classList.toggle("hidden", id === "screenQr");
    $("btnShowHistory").classList.toggle("hidden", id !== "screenMenu" && id !== "screenHistory");
  }

  // ─── ウィザードバー ───────────────────────────────
  const WZ = [
    { id:"screenQr",     label:"QR読取" },
    { id:"screenGuest",  label:"人数"   },
    { id:"screenCourse", label:"コース" },
    { id:"screenMenu",   label:"注文"   },
  ];
  function renderWizard(currentId) {
    const ci = WZ.findIndex(w => w.id === currentId);
    const row = $("wzRow");
    row.innerHTML = "";
    WZ.forEach((w, i) => {
      const state = i < ci ? "done" : i === ci ? "active" : "idle";
      const div = document.createElement("div");
      div.className = "wz-step";
      div.innerHTML = `
        <div class="wz-inner">
          <div class="wz-dot ${state}">${state === "done" ? "✓" : i+1}</div>
          <div class="wz-lbl ${state}">${w.label}</div>
        </div>
        ${i < WZ.length-1 ? `<div class="wz-line ${i < ci ? "done" : ""}"></div>` : ""}`;
      row.appendChild(div);
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

  function toLocalDateTimeString(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return [
      date.getFullYear(),
      "-",
      pad(date.getMonth() + 1),
      "-",
      pad(date.getDate()),
      "T",
      pad(date.getHours()),
      ":",
      pad(date.getMinutes()),
      ":",
      pad(date.getSeconds()),
    ].join("");
  }

  function prepareMockSessionForNewVisit() {
    if (!M.API_CONFIG.USE_MOCK) return;

    const existingOrders = M._readMockOrders();
    const previousSession = existingOrders.find(function(order) {
      return order.customerId === DEMO_CUSTOMER_ID;
    });

    if (!previousSession || previousSession.billStatus === 1) return;

    M._writeMockOrders(existingOrders.filter(function(order) {
      return order.customerId !== DEMO_CUSTOMER_ID;
    }));
    M._writeMockCheckoutRequests(M._readMockCheckoutRequests().filter(function(req) {
      return req.customerId !== DEMO_CUSTOMER_ID;
    }));
  }

  function updateScreenForOrderingState(previouslyLocked) {
    if (isOrderingLocked()) {
      cart = {};
      closeCart();
      renderOrderSummaryScreen();
      showScreen("screenOrderSummary");
      return;
    }

    if (previouslyLocked && $("screenOrderSummary").classList.contains("active")) {
      renderMenuScreen();
      showScreen("screenMenu");
      showToast("✅ 受付中に戻りました。追加注文できます");
    }
  }

  function syncSessionFromApi() {
    if (history.length === 0) return Promise.resolve(sessionBillStatus);

    return M.apiPost(M.buildGetOrdersReq({
      customerId: DEMO_CUSTOMER_ID,
      billStatus: 15,
    }))
      .then(function(res) {
        if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) {
          return sessionBillStatus;
        }
        sessionBillStatus = res.data[0].billStatus || sessionBillStatus;
        return sessionBillStatus;
      })
      .catch(function() {
        return sessionBillStatus;
      });
  }

  function syncCheckoutState() {
    const previouslyLocked = isOrderingLocked();
    return Promise.all([refreshCheckoutRequest(), syncSessionFromApi()])
      .finally(function() {
        updateScreenForOrderingState(previouslyLocked);
      });
  }

  function startCheckoutWatch() {
    if (checkoutWatchTimer) return;
    checkoutWatchTimer = setInterval(syncCheckoutState, 2000);
  }

  function stopCheckoutWatch() {
    if (!checkoutWatchTimer) return;
    clearInterval(checkoutWatchTimer);
    checkoutWatchTimer = null;
  }

  // ═══════════════════════════════════════════════════
  // STEP 0: QRスキャン
  // ═══════════════════════════════════════════════════
  $("btnScan").addEventListener("click", function() {
    const em = $("qrEmoji");
    em.textContent = "⏳";
    this.disabled = true;
    this.textContent = "読み取り中...";
    setTimeout(() => {
      prepareMockSessionForNewVisit();
      tableNo = "1F-1";
      entryTs = Date.now();
      em.textContent = "📷";
      this.disabled = false;
      this.textContent = "📷 QRコードを読み取る（デモ）";
      renderGuestScreen();
      showScreen("screenGuest");
    }, 1800);
  });

  // ═══════════════════════════════════════════════════
  // STEP 1: 人数入力
  // ═══════════════════════════════════════════════════
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
  $("btnGuestNext").addEventListener("click",  () => { renderCourseScreen(); showScreen("screenCourse"); });

  // ═══════════════════════════════════════════════════
  // STEP 2: コース選択（修正3: 戻るボタン追加）
  // ═══════════════════════════════════════════════════
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
  function selectCourse(id) { courseId = id; updateCourseUI(); }
  function updateCourseUI() {
    M.COURSES.forEach(c => {
      const el  = document.querySelector(`.crs-card[data-id="${c.id}"]`);
      const chk = $(`chk_${c.id}`);
      if (!el || !chk) return;
      const sel = courseId === c.id;
      el.classList.toggle("sel", sel);
      el.style.borderColor     = sel ? c.color : "";
      chk.textContent          = sel ? "✓" : "";
      chk.style.background     = sel ? c.color : "";
      chk.style.borderColor    = sel ? c.color : "";
      chk.style.color          = sel ? "#fff"  : "";
    });
    const btn = $("btnCourseNext");
    btn.disabled    = !courseId;
    btn.textContent = courseId ? "注文画面へ進む →" : "コースを選択してください";
  }
  // 戻るボタン（修正3）
  $("btnCourseBack").addEventListener("click", () => {
    courseId = null;
    showScreen("screenGuest");
  });
  $("btnCourseNext").addEventListener("click", () => {
    if (!courseId) return;
    activeCat = "おすすめ";
    renderMenuScreen();
    showScreen("screenMenu");
  });

  // ═══════════════════════════════════════════════════
  // STEP 3: メニュー画面
  // ═══════════════════════════════════════════════════
  function renderMenuScreen() {
    renderInfoBar();
    renderCatBar();
    renderMenuList();
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
    $("drinkPromo").classList.toggle("hidden", !isNomi);
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
      const timerEl = $("ibTimer");
      if (!timerEl) return;
      timerEl.innerHTML = `
        <div class="ib-timer" style="color:${rem <= 30 ? "#fca5a5" : "var(--orl)"}">${rem}分</div>
        <div class="ib-tlbl">残り時間</div>`;
      const loEl = $("loBar");
      if (rem <= 30) {
        loEl.classList.remove("hidden");
        $("loTxt").textContent = `ラストオーダーです（残り${rem}分）`;
      } else {
        loEl.classList.add("hidden");
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
      btn.className = "cat-tab" + (cat.key === activeCat ? " on" : "");
      btn.setAttribute("role", "tab");
      const dot = (cat.type === "drink" && isNomi)
        ? `<span class="drink-dot">放題</span>` : "";
      btn.innerHTML = `<span class="ct-em">${cat.emoji}</span><span class="ct-lbl">${cat.key}</span>${dot}`;
      btn.addEventListener("click", () => {
        activeCat = cat.key;
        renderCatBar();
        renderMenuList();
      });
      bar.appendChild(btn);
    });
  }

  // ── メニューリスト ──
  function renderMenuList() {
    const list = $("menuList");
    list.innerHTML = "";

    // 修正②: M.MENU[activeCat] が undefined のときはフォールバック
    const items = (M.MENU && M.MENU[activeCat]) ? M.MENU[activeCat] : [];

    const isNomi = courseId !== "alacarte";
    if (activeCat === "ドリンク" && isNomi) {
      const lbl = document.createElement("div");
      lbl.className = "sec-lbl";
      lbl.textContent = "🍺 飲み放題対象メニュー";
      list.appendChild(lbl);
    }

    items.forEach(item => {
      const qty = cart[item.id] || 0;
      const displayPrice = M.getItemPriceForCourse(item.id, courseId);
      const el  = document.createElement("div");
      el.className = "mcard" + (qty > 0 ? " ic" : "");
      const tagHtml = item.tag
        ? `<span class="mc-tag" style="background:${item.tag === "人気" ? "#e8621a" : "#5c6e3a"}">${item.tag}</span>` : "";
      const priceHtml = displayPrice === 0
        ? `<div class="mc-price free">無料</div>`
        : `<div class="mc-price">¥${displayPrice.toLocaleString()}</div>`;
      el.innerHTML = `
        <div class="mc-em">${item.emoji}</div>
        <div class="mc-body">
          <div class="mc-nr"><span class="mc-name">${item.name}</span>${tagHtml}</div>
          <div class="mc-desc">${item.desc}</div>
          ${priceHtml}
        </div>
        <div class="mc-qc">
          ${qty > 0 ? `<button class="mc-qb mc-dec" data-id="${item.id}" aria-label="減らす">−</button><span class="mc-qn">${qty}</span>` : ""}
          <button class="mc-qb mc-inc" data-id="${item.id}" aria-label="増やす">＋</button>
        </div>`;
      list.appendChild(el);
    });

  }

  $("menuList").addEventListener("click", function(e) {
    const inc = e.target.closest(".mc-inc");
    const dec = e.target.closest(".mc-dec");
    if (inc) updCart(Number(inc.dataset.id),  1);
    if (dec) updCart(Number(dec.dataset.id), -1);
  });

  function updCart(id, delta) {
    if (isOrderingLocked()) {
      renderOrderSummaryScreen();
      showScreen("screenOrderSummary");
      return;
    }
    cart[id] = Math.max(0, (cart[id] || 0) + delta);
    if (cart[id] === 0) delete cart[id];
    renderMenuList();
    updateBotNav();
  }

  function updateBotNav() {
    const cnt = Object.values(cart).reduce((s, q) => s + q, 0);
    const btn = $("btnOpenCart");
    btn.disabled = cnt === 0;
    btn.innerHTML = cnt > 0
      ? `🛒 カートを見る <span style="background:#fff;color:var(--or);border-radius:50%;width:18px;height:18px;font-size:.62rem;font-weight:900;display:inline-flex;align-items:center;justify-content:center">${cnt}</span>`
      : "🛒 カートを見る";
  }

  // ═══════════════════════════════════════════════════
  // カートドロワー
  // ═══════════════════════════════════════════════════
  $("btnOpenCart").addEventListener("click", openCart);
  $("btnCloseCart").addEventListener("click", closeCart);
  $("btnBackToMenu").addEventListener("click", closeCart);
  $("cartOverlay").addEventListener("click", e => { if (e.target === $("cartOverlay")) closeCart(); });

  function openCart()  { renderCart(); $("cartOverlay").classList.remove("hidden"); }
  function closeCart() { $("cartOverlay").classList.add("hidden"); }

  function renderCart() {
    const c       = M.getCourse(courseId);
    const cf      = c ? c.price * guests : 0;
    const entries = Object.entries(cart).filter(([, q]) => q > 0);
    const itemTot = entries.reduce((s, [id, q]) => s + M.getItemPriceForCourse(id, courseId) * q, 0);
    const total   = cf + itemTot;

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
    if (entries.length === 0) {
      html += `<div class="cart-empty"><div class="cem">🍽️</div><p>メニューから商品を選んでください</p></div>`;
    } else {
      entries.forEach(([id, qty]) => {
        const m = M.getItem(id);
        if (!m) return;
        const itemPrice = M.getItemPriceForCourse(id, courseId);
        html += `<div class="cart-item">
          <div class="ci-em">${m.emoji}</div>
          <div class="ci-body">
            <div class="ci-name">${m.name}</div>
            <div class="ci-unit">${itemPrice === 0 ? "無料" : `¥${itemPrice.toLocaleString()} × ${qty}`}</div>
            <div class="ci-sub">${itemPrice === 0 ? "¥0" : `¥${(itemPrice*qty).toLocaleString()}`}</div>
          </div>
          <div class="ci-ctrl">
            <button class="ci-btn ci-del" data-id="${id}" aria-label="削除">🗑</button>
            <button class="ci-btn ci-dec" data-id="${id}" aria-label="減らす">−</button>
            <span class="ci-num">${qty}</span>
            <button class="ci-btn ci-inc" data-id="${id}" aria-label="増やす">＋</button>
          </div>
        </div>`;
      });
    }

    $("cartItems").innerHTML = html;
    $("cartTotal").textContent = `¥${total.toLocaleString()}`;
    $("cartBreakdown").innerHTML = entries.length > 0
      ? `<span>コース ¥${cf.toLocaleString()}</span><span>料理・ドリンク ¥${itemTot.toLocaleString()}</span>` : "";

    const btnOrd = $("btnOrder");
    const totalQty = Object.values(cart).reduce((s,q)=>s+q,0);
    btnOrd.disabled    = entries.length === 0;
    btnOrd.textContent = entries.length === 0 ? "商品を選んでください" : `${totalQty}品を注文する →`;

  }

  $("cartItems").addEventListener("click", function(e) {
    const btn = e.target.closest(".ci-btn");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.classList.contains("ci-del")) updCart(id, -999);
    else if (btn.classList.contains("ci-dec")) updCart(id, -1);
    else if (btn.classList.contains("ci-inc")) updCart(id,  1);
    renderCart();
  });

  // ═══════════════════════════════════════════════════
  // 注文確定（修正⑤: async/await を Promise チェーンに変更し確実に完了させる）
  // ═══════════════════════════════════════════════════
  $("btnOrder").addEventListener("click", placeOrder);

  function placeOrder() {
    if (isOrderingLocked()) {
      renderOrderSummaryScreen();
      showScreen("screenOrderSummary");
      return;
    }
    const entries = Object.entries(cart).filter(([, q]) => q > 0);
    if (entries.length === 0) return;

    const btnOrd = $("btnOrder");
    btnOrd.disabled    = true;
    btnOrd.textContent = "送信中...";

    const items = entries.map(([id, qty]) => {
      const m = M.getItem(id);
      return { name: m.name, price: M.getItemPriceForCourse(id, courseId), qty, served: 0 };
    });

    const order = {
      id:         M.nextOid(),
      customerId: DEMO_CUSTOMER_ID,
      tableNo,
      guests,
      courseId,
      entryTime:  M.fmtTime(new Date(entryTs)),
      status:     1,
      items,
      apiStatus:  "pending",
      orderedAt:  new Date().toISOString(),
    };

    const payload = M.buildCreateOrderReq({
      storeId: STORE_ID,
      customerId: DEMO_CUSTOMER_ID,
      tableNo,
      guestCount: guests,
      courseKey: courseId,
      entryTime: toLocalDateTimeString(new Date(entryTs)),
      items: entries.map(([id, qty]) => {
        const m = M.getItem(id);
        return {
          menuName: m.name,
          unitPrice: M.getItemPriceForCourse(id, courseId),
          taxRate: 10,
          orderQty: qty,
          offerQty: 0,
          categoryName: M.getCategoryForItem(id),
        };
      }),
    });

    M.apiPost(payload)
      .then(function(res) {
        if (!res.ok) {
          order.apiStatus = "ng";
          const msg = res.error && res.error.message ? res.error.message : "注文の送信に失敗しました";
          showToast("⚠️ " + msg);
          return false;
        }
        order.apiStatus = "ok";
        order.hash = res.data && res.data.hash ? res.data.hash : null;
        history.unshift(order);
        cart = {};
        closeCart();
        renderMenuList();
        updateBotNav();
        $("doneOverlay").classList.remove("hidden");
        return true;
      })
      .catch(function() {
        order.apiStatus = "ng";
        showToast("⚠️ 注文の送信に失敗しました");
        return false;
      })
      .finally(function() {
        const totalQty = Object.values(cart).reduce((s, q) => s + q, 0);
        btnOrd.disabled    = false;
        btnOrd.textContent = totalQty > 0 ? `${totalQty}品を注文する →` : "商品を選んでください";
      });
  }

  $("btnDoneCont").addEventListener("click",  () => $("doneOverlay").classList.add("hidden"));
  $("btnDoneClose").addEventListener("click", () => $("doneOverlay").classList.add("hidden"));

  // ═══════════════════════════════════════════════════
  // 注文履歴
  // ═══════════════════════════════════════════════════
  $("btnNavHistory").addEventListener("click",      openHistory);
  $("btnShowHistory").addEventListener("click",     openHistory);
  $("btnHistBack").addEventListener("click",        () => showScreen("screenMenu"));
  $("btnNavMenuFromHist").addEventListener("click", () => showScreen("screenMenu"));
  $("btnNavMenu").addEventListener("click",         () => showScreen("screenMenu"));

  function openHistory() {
    syncCheckoutState().finally(function() {
      if (isOrderingLocked()) {
        renderOrderSummaryScreen();
        showScreen("screenOrderSummary");
        return;
      }
      renderHistoryScreen();
      showScreen("screenHistory");
    });
  }

  function refreshCheckoutRequest() {
    if (history.length === 0) {
      checkoutRequest = null;
      return Promise.resolve(null);
    }
    return M.checkoutApiPost(M.buildGetCheckoutRequestsReq({
      customerId: DEMO_CUSTOMER_ID,
    }))
      .then(function(res) {
        if (!res.ok || !Array.isArray(res.data)) return checkoutRequest;
        checkoutRequest = res.data.find(function(req) {
          return req.status === "pending" || req.status === "acknowledged";
        }) || null;
        return checkoutRequest;
      })
      .catch(function() {
        return checkoutRequest;
      });
  }

  function requestCheckout() {
    if (history.length === 0 || checkoutRequest) return;

    checkoutLockPending = true;
    cart = {};
    closeCart();
    renderOrderSummaryScreen();
    showScreen("screenOrderSummary");

    const btn = $("btnRequestCheckout");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "送信中...";
    }

    const latestHash = history.find(function(ord) { return ord.hash; })?.hash || null;
    M.checkoutApiPost(M.buildRequestCheckoutReq({
      customerId: DEMO_CUSTOMER_ID,
      tableNo,
      orderHash: latestHash,
    }))
      .then(function(res) {
        if (!res.ok) {
          checkoutLockPending = false;
          renderHistoryScreen();
          showScreen("screenHistory");
          const msg = res.error && res.error.message ? res.error.message : "会計依頼の送信に失敗しました";
          showToast("⚠️ " + msg);
          return;
        }
        checkoutRequest = res.data;
        checkoutLockPending = false;
        renderOrderSummaryScreen();
        startCheckoutWatch();
        showToast("✅ お会計をスタッフに依頼しました");
      })
      .catch(function() {
        checkoutLockPending = false;
        renderHistoryScreen();
        showScreen("screenHistory");
        showToast("⚠️ 会計依頼の送信に失敗しました");
      })
      .finally(function() {
        const nextBtn = $("btnRequestCheckout");
        if (nextBtn && !checkoutRequest) {
          nextBtn.disabled = false;
          nextBtn.textContent = "お会計に進む";
        }
      });
  }

  function renderHistoryScreen() {
    const c      = M.getCourse(courseId);
    const cf     = c ? c.price * guests : 0;
    const itemTot = history.reduce((s, h) =>
      s + h.items.reduce((ss, it) => ss + it.price * it.qty, 0), 0);
    const total  = cf + itemTot;

    $("histSub").textContent = history.length + "回の注文";

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
      html += `<div class="checkout-card">
        <div>
          <div class="checkout-title">お会計</div>
          <div class="checkout-sub">お会計の際はレジまでお越しください</div>
        </div>
        <button class="checkout-btn" id="btnRequestCheckout"${checkoutRequest ? " disabled" : ""}>
          ${checkoutRequest ? "依頼済み" : "お会計に進む"}
        </button>
      </div>`;
    } else {
      html += `<div style="text-align:center;padding:48px 20px;color:var(--ts)">
        <div style="font-size:3rem;margin-bottom:10px">🍽️</div>
        <p style="font-size:.83rem">まだ注文がありません<br>メニューからご注文ください</p>
      </div>`;
    }

    history.forEach(function(ord) {
      const ordTot = ord.items.reduce((s, it) => s + it.price * it.qty, 0);
      const ordTime = ord.orderedAt
        ? new Date(ord.orderedAt).toTimeString().slice(0,5)
        : ord.entryTime;
      const itemCount = ord.items.reduce((sum, item) => sum + item.qty, 0);
      const apiLabels = {
        ok:      `<div class="api-status ok">● API送信済み</div>`,
        ng:      `<div class="api-status ng">● 送信失敗</div>`,
        pending: `<div class="api-status pending">● 送信中…</div>`,
      };
      const apiHtml = apiLabels[ord.apiStatus] || "";
      html += `<div class="hist-session">
        <div class="hs-header">
          <div class="hs-h-l">
            <div class="hs-time">注文時刻 ${ordTime}</div>
            <div class="hs-meta">
              <span style="font-size:.65rem;color:var(--ts)">${itemCount}品</span>
            </div>
          </div>${apiHtml}
        </div>
        <div class="hs-items">
          ${ord.items.map(function(it) {
            return `<div class="hs-row">
              <span class="hs-name">${it.name}</span>
              <span class="hs-qty">× ${it.qty}</span>
              <span class="hs-price">${it.price === 0 ? "無料" : "¥" + (it.price * it.qty).toLocaleString()}</span>
            </div>`;
          }).join("")}
        </div>
        <div class="hs-footer">
          <div class="hs-total">小計 ¥${ordTot.toLocaleString()}</div>
          <div style="font-size:.64rem;color:var(--ts)">ID: ${ord.id}</div>
        </div>
      </div>`;
    });

    $("histBody").innerHTML = html;
  }

  $("histBody").addEventListener("click", function(e) {
    if (e.target.closest("#btnRequestCheckout")) {
      $("checkoutConfirmOverlay").classList.remove("hidden");
    }
  });

  $("btnCancelCheckout").addEventListener("click", function() {
    $("checkoutConfirmOverlay").classList.add("hidden");
  });
  $("checkoutConfirmOverlay").addEventListener("click", function(e) {
    if (e.target === $("checkoutConfirmOverlay")) {
      $("checkoutConfirmOverlay").classList.add("hidden");
    }
  });
  $("btnConfirmCheckout").addEventListener("click", function() {
    $("checkoutConfirmOverlay").classList.add("hidden");
    requestCheckout();
  });

  function renderOrderSummaryScreen() {
    const c = M.getCourse(courseId);
    const cf = c ? c.price * guests : 0;
    const itemTot = history.reduce((s, h) =>
      s + h.items.reduce((ss, it) => ss + it.price * it.qty, 0), 0);
    const total = cf + itemTot;
    const itemCount = history.reduce((sum, order) =>
      sum + order.items.reduce((orderSum, item) => orderSum + item.qty, 0), 0);
    const statusText = sessionBillStatus === 2
      ? "会計済み"
      : sessionBillStatus === 4
        ? "スタッフへお声がけください"
        : sessionBillStatus === 8
          ? "会計処理中"
          : "会計依頼中";

    $("orderSummarySub").textContent = `${statusText} ／ ${itemCount}品`;

    let html = `<div class="locked-checkout-card">
      <div class="locked-title">${statusText}</div>
      <div class="locked-msg">追加注文はできません。<br>レジまでお越しください。</div>
    </div>
    <div class="hist-summary">
      <div>
        <div class="hs-sum-l">ご注文合計（税込）</div>
        <div class="hs-sum-val">¥${total.toLocaleString()}</div>
        <div class="hs-sum-sub">${c && c.price > 0 ? `コース ¥${cf.toLocaleString()} + ` : ""}料理・ドリンク ¥${itemTot.toLocaleString()}</div>
      </div>
      ${c ? `<span style="font-size:.68rem;font-weight:700;padding:4px 10px;border-radius:20px;background:${c.color};color:#fff">${c.emoji} ${c.shortLabel}</span>` : ""}
    </div>`;

    history.forEach(function(ord) {
      const ordTot = ord.items.reduce((s, it) => s + it.price * it.qty, 0);
      const ordTime = ord.orderedAt
        ? new Date(ord.orderedAt).toTimeString().slice(0,5)
        : ord.entryTime;
      const orderItemCount = ord.items.reduce((sum, item) => sum + item.qty, 0);
      html += `<div class="hist-session">
        <div class="hs-header">
          <div class="hs-h-l">
            <div class="hs-time">注文時刻 ${ordTime}</div>
            <div class="hs-meta"><span style="font-size:.65rem;color:var(--ts)">${orderItemCount}品</span></div>
          </div>
        </div>
        <div class="hs-items">
          ${ord.items.map(function(it) {
            return `<div class="hs-row">
              <span class="hs-name">${it.name}</span>
              <span class="hs-qty">× ${it.qty}</span>
              <span class="hs-price">${it.price === 0 ? "無料" : "¥" + (it.price * it.qty).toLocaleString()}</span>
            </div>`;
          }).join("")}
        </div>
        <div class="hs-footer"><div class="hs-total">小計 ¥${ordTot.toLocaleString()}</div></div>
      </div>`;
    });

    $("orderSummaryBody").innerHTML = html;
  }

  // ═══════════════════════════════════════════════════
  // デモリセット
  // ═══════════════════════════════════════════════════
  $("btnReset").addEventListener("click", function() {
    tableNo = ""; guests = 2; courseId = null; entryTs = null;
    cart = {}; history = []; checkoutRequest = null; checkoutLockPending = false; sessionBillStatus = 1; activeCat = "おすすめ";
    stopCheckoutWatch();
    if (M.API_CONFIG.USE_MOCK) {
      M._writeMockOrders(M._seedMockOrders());
      const nextRequests = M._readMockCheckoutRequests().filter(req => req.customerId !== DEMO_CUSTOMER_ID);
      M._writeMockCheckoutRequests(nextRequests);
    }
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    showScreen("screenQr");
  });

  // ─── 初期化 ──────────────────────────────────────
  window.addEventListener("storage", function(e) {
    if (!M.API_CONFIG.USE_MOCK) return;
    if (e.key !== M._mockOrderStorageKey && e.key !== "mos_checkout_requests_v2") return;
    syncCheckoutState();
  });

  showScreen("screenQr");

}); // DOMContentLoaded
