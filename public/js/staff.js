/**
 * js/staff.js
 * 居酒屋みどり亭 MOS — スタッフ管理画面ロジック
 */

"use strict";

(function() {
  const M = window.MOS;
  const $ = (id) => document.getElementById(id);

  // ─── State ───────────────────────────────────────
  let currentUser = null;
  let orders      = JSON.parse(JSON.stringify(M.SEED_ORDERS));
  let tables      = JSON.parse(JSON.stringify(M.TABLES));
  let statuses    = JSON.parse(JSON.stringify(M.DEFAULT_TABLE_STATUSES));
  let checkoutRequests = [];
  let checkoutRequestsLoaded = false;
  let realtimeTimer = null;
  let salesRange = 7;
  let billingHistoryRange = "today";
  let staffList   = M.STAFF_ACCOUNTS.map((a, i) => ({
    ...a, joinDate: "2023-04-01", active: true, colorIdx: i,
  }));
  let deleteCallback = null;
  const COLOR_OPTS = ["#e8621a","#f59e0b","#22c55e","#6366f1","#ec4899","#ef4444","#94a3b8","#0ea5e9"];
  let newStatusColor = COLOR_OPTS[0];

  // ─── 時計 ─────────────────────────────────────────
  setInterval(() => {
    const el = $("tbClock");
    if (el) el.textContent = new Date().toTimeString().slice(0,5);
  }, 1000);

  // ─── 画面切替 ────────────────────────────────────
  const SCREENS = ["screenLogin","screenHome","screenOrders","screenBilling","screenTables","screenStaff","screenSales"];
  function showScreen(id) {
    SCREENS.forEach(s => {
      const el = $(s);
      if (el) el.classList.toggle("active", el.id === id);
    });
    const isHome  = id === "screenHome";
    const isInner = ["screenOrders","screenBilling","screenTables","screenStaff","screenSales"].includes(id);
    const backBtn = $("btnGoHome");
    if (backBtn) backBtn.classList.toggle("hidden", !isInner);
    $("sApp").classList.toggle("hidden", id === "screenLogin");
  }

  // ─── トースト ─────────────────────────────────────
  function toast(msg) {
    const el = $("sToast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(el._tid);
    el._tid = setTimeout(() => el.classList.add("hidden"), 3200);
  }

  function mapApiOrder(order) {
    return {
      id: order.hash,
      hash: order.hash,
      customerId: order.customerId,
      tableNo: order.tableNo || "-",
      guests: order.guestCount || 1,
      courseId: order.courseKey || "alacarte",
      time: order.entryTime ? String(order.entryTime).slice(11, 16) : "--:--",
      status: order.billStatus,
      items: (order.items || []).map(item => ({
        name: item.menuName,
        price: item.unitPrice,
        qty: item.orderQty,
        served: item.offerQty,
        orderTime: item.orderTime || order.entryTime || null,
      })),
    };
  }

  function refreshOrdersFromApi() {
    return M.apiPost(M.buildGetOrdersReq({ billStatus: 15 }))
      .then(res => {
        if (!res.ok || !Array.isArray(res.data)) {
          toast("⚠️ 注文情報の取得に失敗しました");
          return orders;
        }
        orders = res.data.map(mapApiOrder);
        return orders;
      })
      .catch(() => {
        toast("⚠️ 注文情報の取得に失敗しました");
        return orders;
      });
  }

  function refreshCheckoutRequestsFromApi() {
    const previousPendingIds = new Set(
      checkoutRequests
        .filter(req => req.status === "pending")
        .map(req => req.id)
    );

    return M.checkoutApiPost(M.buildGetCheckoutRequestsReq({}))
      .then(res => {
        if (!res.ok || !Array.isArray(res.data)) {
          toast("⚠️ 会計依頼の取得に失敗しました");
          return checkoutRequests;
        }
        checkoutRequests = res.data;

        const newPending = checkoutRequests.find(req =>
          req.status === "pending" && !previousPendingIds.has(req.id)
        );
        if (currentUser && checkoutRequestsLoaded && newPending) {
          toast(`🔔 ${newPending.tableNo}番テーブルから会計依頼が届きました`);
        }
        checkoutRequestsLoaded = true;
        return checkoutRequests;
      })
      .catch(() => {
        toast("⚠️ 会計依頼の取得に失敗しました");
        return checkoutRequests;
      });
  }

  function refreshStaffData() {
    return Promise.all([
      refreshOrdersFromApi(),
      refreshCheckoutRequestsFromApi(),
    ]);
  }

  function pendingCheckoutCount() {
    return checkoutRequests.filter(req => req.status === "pending").length;
  }

  function activeCheckoutCount() {
    return checkoutRequests.filter(req => req.status === "pending" || req.status === "acknowledged").length;
  }

  function latestPendingCheckout() {
    return checkoutRequests.find(req => req.status === "pending") || null;
  }

  function activeCheckoutRequestForCustomer(customerId) {
    return checkoutRequests.find(req =>
      req.customerId === customerId &&
      (req.status === "pending" || req.status === "acknowledged")
    ) || null;
  }

  function activeServiceOrders() {
    return orders.filter(order => order.status === 1 || order.status === 8);
  }

  function activeScreenId() {
    return SCREENS.find(id => $(id)?.classList.contains("active")) || null;
  }

  function renderRealtimeCheckoutViews() {
    renderCheckoutNotification();

    const currentScreen = activeScreenId();
    if (currentScreen === "screenHome") renderHome(false);
    if (currentScreen === "screenBilling") renderBilling();
  }

  function startRealtimeSync() {
    stopRealtimeSync();
    realtimeTimer = setInterval(() => {
      if (!currentUser) return;
      refreshCheckoutRequestsFromApi().then(renderRealtimeCheckoutViews);
    }, 2000);
  }

  function stopRealtimeSync() {
    if (!realtimeTimer) return;
    clearInterval(realtimeTimer);
    realtimeTimer = null;
  }

  function serviceSummary(ord) {
    return ord.items.reduce((acc, item) => {
      acc.ordered += item.qty;
      acc.served += item.served;
      return acc;
    }, { ordered: 0, served: 0 });
  }

  function isServiceComplete(ord) {
    return ord.items.length > 0 && ord.items.every(item => item.served >= item.qty);
  }

  function persistMockServedQty(ord) {
    if (!M.API_CONFIG.USE_MOCK || !ord.hash) return;
    const nextOrders = M._readMockOrders().map(order => {
      if (order.hash !== ord.hash) return order;
      return {
        ...order,
        items: order.items.map((item, index) => ({
          ...item,
          offerQty: ord.items[index] ? ord.items[index].served : item.offerQty,
        })),
      };
    });
    M._writeMockOrders(nextOrders);
  }

  function applyLocalSessionStatus(customerId, status) {
    orders = orders.map(order =>
      order.customerId === customerId ? { ...order, status } : order
    );
  }

  function resolveCheckoutRequestForCustomer(customerId) {
    const request = activeCheckoutRequestForCustomer(customerId);
    if (!request) return Promise.resolve(null);

    return M.checkoutApiPost(M.buildUpdateCheckoutRequestStatusReq({
      requestId: request.id,
      status: "resolved",
    }))
      .then(res => {
        if (!res.ok) return null;
        checkoutRequests = checkoutRequests.map(item =>
          item.id === request.id ? { ...item, status: "resolved" } : item
        );
        renderCheckoutNotification();
        renderHome(false);
        renderBilling();
        return request;
      })
      .catch(() => null);
  }

  // ヒントテーブル
  const hintBody = $("loginHintBody");
  if (hintBody) {
    hintBody.innerHTML = M.STAFF_ACCOUNTS.map(a =>
      `<tr><td>${a.id}</td><td style="font-family:monospace">${a.password}</td>
       <td>${a.name}</td>
       <td class="${a.role === "manager" ? "lh-mgr" : ""}">${a.role === "manager" ? "👑 管理職" : "スタッフ"}</td></tr>`
    ).join("");
  }

  function doLogin() {
    const id = $("inputStaffId").value.trim().toUpperCase();
    const pw = $("inputPassword").value;
    const acc = M.STAFF_ACCOUNTS.find(a => a.id === id && a.password === pw);
    if (!acc) {
      showLoginError("社員番号またはパスワードが正しくありません");
      return;
    }
    currentUser = acc;
    $("inputPassword").value = "";
    $("loginErr").classList.add("hidden");
    renderTopbar();
    refreshStaffData().finally(() => {
      renderHome();
      renderCheckoutNotification();
      showScreen("screenHome");
      startRealtimeSync();
      toast(`✅ ようこそ、${acc.name} さん`);
    });
  }
  function showLoginError(msg) {
    const err = $("loginErr");
    err.textContent = "⚠️ " + msg;
    err.classList.remove("hidden");
    const card = $("loginCard");
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    $("inputPassword").value = "";
  }
  $("btnLogin").addEventListener("click", doLogin);
  [$("inputStaffId"), $("inputPassword")].forEach(el => {
    el.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
  });
  $("btnLogout").addEventListener("click", () => {
    stopRealtimeSync();
    currentUser = null;
    checkoutRequestsLoaded = false;
    $("inputStaffId").value = "";
    $("inputPassword").value = "";
    showScreen("screenLogin");
  });
  $("btnGoHome").addEventListener("click", () => {
    refreshStaffData().finally(() => {
      renderHome();
      renderCheckoutNotification();
      showScreen("screenHome");
    });
  });

  // ─────────────────────────────────────────────────
  // トップバー
  // ─────────────────────────────────────────────────
  function renderTopbar() {
    if (!currentUser) return;
    const hue = currentUser.hue || 28;
    $("tbUser").innerHTML = `
      <div class="tb-av" style="background:hsl(${hue},60%,38%)">${currentUser.name[0]}</div>
      <div>
        <div class="tb-uname">${currentUser.name}</div>
        <div class="tb-role">${currentUser.role === "manager" ? "👑 管理職" : "👤 スタッフ"}</div>
      </div>`;
    $("tbClock").textContent = new Date().toTimeString().slice(0,5);
  }

  $("btnDismissNotif").addEventListener("click", () => {
    const req = latestPendingCheckout();
    if (!req) return;

    M.checkoutApiPost(M.buildUpdateCheckoutRequestStatusReq({
      requestId: req.id,
      status: "acknowledged",
    }))
      .then(res => {
        if (!res.ok) {
          toast("⚠️ 会計依頼の確認に失敗しました");
          return;
        }
        checkoutRequests = checkoutRequests.map(item =>
          item.id === req.id ? { ...item, status: "acknowledged" } : item
        );
        renderCheckoutNotification();
        renderHome(false);
        renderBilling();
        toast(`✅ ${req.tableNo}番テーブルの会計依頼を確認しました`);
      })
      .catch(() => toast("⚠️ 会計依頼の確認に失敗しました"));
  });

  function renderCheckoutNotification() {
    const req = latestPendingCheckout();
    const notif = $("callNotif");
    if (!req) {
      notif.classList.add("hidden");
      return;
    }
    const requestedAt = req.requestedAt ? String(req.requestedAt).slice(11, 16) : "--:--";
    $("callNotifTxt").textContent = `会計依頼：${req.tableNo}番テーブル（${requestedAt}）`;
    notif.classList.remove("hidden");
  }

  // ─────────────────────────────────────────────────
  // ホーム画面
  // ─────────────────────────────────────────────────
  const FEATURES = [
    { key:"orders",  label:"注文管理",    sub:"受信注文の確認・配膳完了", icon:"📋", accent:"#e8621a", roles:["staff","manager"] },
    { key:"billing", label:"会計管理",    sub:"QR単位で会計開始",         icon:"💴", accent:"#7c3aed", roles:["staff","manager"] },
    { key:"tables",  label:"卓管理",      sub:"テーブル状況・ステータス管理", icon:"🪑", accent:"#22c55e", roles:["staff","manager"] },
    { key:"staff",   label:"スタッフ管理",sub:"アカウント追加・削除・権限",   icon:"👥", accent:"#818cf8", roles:["manager"] },
    { key:"sales",   label:"売上レポート",sub:"日次・週次の売上推移",          icon:"📊", accent:"#f59e0b", roles:["manager"] },
  ];

  function todayKey() {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function todayLabel() {
    return new Date()
      .toLocaleDateString("ja-JP", { month:"numeric", day:"numeric", weekday:"short" });
  }

  function orderTotal(order) {
    const course = M.getCourse(order.courseId);
    const courseTotal = course ? course.price * order.guests : 0;
    const itemTotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return courseTotal + itemTotal;
  }

  function todaySalesSummary() {
    const paidOrders = orders.filter(order => order.status === 2);
    return {
      date: todayKey(),
      d: todayLabel(),
      s: paidOrders.reduce((sum, order) => sum + orderTotal(order), 0),
      o: paidOrders.length,
      g: paidOrders.reduce((sum, order) => sum + order.guests, 0),
    };
  }

  function salesRowsWithToday() {
    return M.SALES_DATA.concat(todaySalesSummary());
  }

  function todayBillingHistory() {
    return orders
      .filter(order => order.status === 2)
      .map((order, index) => ({
        id: `TODAY-${order.hash || order.id || index}`,
        date: todayKey(),
        d: todayLabel(),
        time: order.time || "--:--",
        tableNo: order.tableNo,
        guests: order.guests,
        total: orderTotal(order),
        status: order.status,
      }));
  }

  function billingHistoryRows() {
    return M.BILLING_HISTORY_DATA.concat(todayBillingHistory());
  }

  function renderHome(animateCards = true) {
    if (!currentUser) return;
    const serviceOrders = activeServiceOrders();
    const pendingService = serviceOrders.filter(order => !isServiceComplete(order)).length;
    const completedService = serviceOrders.filter(order => isServiceComplete(order)).length;
    const checkoutActive = activeCheckoutCount();
    const todayS  = todaySalesSummary().s;

    $("homeGreet").textContent = `こんにちは、${currentUser.name.split(" ")[0]}さん 👋`;
    $("homeDate").textContent  = new Date().toLocaleDateString("ja-JP", {month:"long",day:"numeric",weekday:"short"}) + " · 緑橋一号店";

    $("homeStats").innerHTML = [
      { v:pendingService,              l:"未提供あり", or:true  },
      { v:completedService,            l:"配膳完了",   or:false },
      { v:checkoutActive,              l:"会計依頼",   or:false },
      { v:`¥${todayS.toLocaleString()}`, l:"本日売上", or:true  },
    ].map(s => `<div class="stat"><div class="stat-v${s.or?" or":""}">${s.v}</div><div class="stat-l">${s.l}</div></div>`).join("");

    const visible = FEATURES.filter(f => f.roles.includes(currentUser.role));
    $("featureGrid").innerHTML = visible.map((f, i) => `
      <div class="fc${animateCards ? "" : " no-anim"}" style="animation-delay:${i*55}ms" data-feature="${f.key}">
        <div class="fc-body">
          <span class="fc-icon">${f.icon}</span>
          <div class="fc-name">${f.label}</div>
          <div class="fc-sub">${f.sub}</div>
        </div>
        <div class="fc-foot" style="background:${f.accent}18">
          <span class="fc-tag" style="background:${f.accent}">
            ${f.key==="orders" && pendingService > 0
              ? `未提供 ${pendingService}件`
              : f.key==="billing" && checkoutActive > 0
                ? `会計依頼 ${checkoutActive}件`
                : "利用可能"}
          </span>
          <span class="fc-arr" style="color:${f.accent}">→</span>
        </div>
      </div>`).join("");

  }

  $("featureGrid").addEventListener("click", e => {
    const fc = e.target.closest(".fc");
    if (!fc) return;
    navigateTo(fc.dataset.feature);
  });

  function navigateTo(key) {
    const actions = {
      orders: () => {
        refreshStaffData().finally(() => {
          renderOrders();
          renderCheckoutNotification();
          showScreen("screenOrders");
        });
      },
      billing: () => {
        refreshStaffData().finally(() => {
          renderBilling();
          renderCheckoutNotification();
          showScreen("screenBilling");
        });
      },
      tables: () => { renderTables();  showScreen("screenTables"); },
      staff:  () => { renderStaff();   showScreen("screenStaff");  },
      sales:  () => { renderSales();   showScreen("screenSales");  },
    };
    actions[key]?.();
  }

  // ──────────────────────────────────────────────────
  // 注文管理
  // ──────────────────────────────────────────────────
  let orderFilter = "all";
  const OF_DEFS = [["all","すべて"],["pending","未提供あり"],["done","配膳完了"]];

  function serviceOrderGroups() {
    return activeServiceOrders().flatMap(order => {
      const groups = new Map();
      order.items.forEach((item, sourceIndex) => {
        const groupKey = item.orderTime || `${order.id}-initial`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            ...order,
            id: `${order.id}::${groupKey}`,
            parentId: order.id,
            submittedAt: groupKey,
            displayTime: groupKey && String(groupKey).length >= 16
              ? String(groupKey).slice(11, 16)
              : order.time,
            items: [],
          });
        }
        groups.get(groupKey).items.push({ ...item, sourceIndex });
      });
      return Array.from(groups.values());
    }).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  }

  function countOrdersForServiceFilter(filter) {
    const orderGroups = serviceOrderGroups();
    if (filter === "pending") return orderGroups.filter(order => !isServiceComplete(order)).length;
    if (filter === "done") return orderGroups.filter(order => isServiceComplete(order)).length;
    return orderGroups.length;
  }

  function filteredServiceOrders() {
    const orderGroups = serviceOrderGroups();
    if (orderFilter === "pending") return orderGroups.filter(order => !isServiceComplete(order));
    if (orderFilter === "done") return orderGroups.filter(order => isServiceComplete(order));
    return orderGroups;
  }

  function renderOrders() {
    const orderGroups = serviceOrderGroups();
    const pendingCount = orderGroups.filter(order => !isServiceComplete(order)).length;
    const doneCount = orderGroups.filter(order => isServiceComplete(order)).length;
    $("ordersSub").textContent =
      `未提供あり ${pendingCount}件 ／ 配膳完了 ${doneCount}件`;

    $("orderFilters").innerHTML = OF_DEFS.map(([value, label]) =>
      `<button class="of${orderFilter===value?" on":""}" data-v="${value}">${label} <span style="opacity:.55">(${countOrdersForServiceFilter(value)})</span></button>`
    ).join("");
    $("orderFilters").querySelectorAll(".of").forEach(button => {
      button.addEventListener("click", () => { orderFilter = button.dataset.v; renderOrders(); });
    });

    const list = $("orderList");
    const filtered = filteredServiceOrders();
    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="em">📋</div><p>該当する注文はありません</p></div>`;
      return;
    }
    list.innerHTML = filtered.map(ord => {
      const c = M.getCourse(ord.courseId);
      const total = ord.items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const summary = serviceSummary(ord);
      const done = isServiceComplete(ord);
      const pendingQty = Math.max(0, summary.ordered - summary.served);
      return `<div class="oc${done?" served":""}" data-id="${ord.id}">
        <div class="oc-head">
          <div>
            <div class="oc-tbl">🪑 ${ord.tableNo}</div>
            <div class="oc-meta">
              ${c?`<span class="tag" style="background:${c.color}">${c.shortLabel}</span>`:""}
              <span style="font-size:.68rem;color:var(--tx2)">${ord.guests}名</span>
            </div>
            <div class="oc-id">注文時刻 ${ord.displayTime} | ID:${ord.parentId}</div>
          </div>
          <span class="service-bs ${done?" done":"pending"}">${done?"配膳完了":"未提供あり"}</span>
        </div>
        <div class="oc-items">
          ${ord.items.map(item => `
            <div class="oi-row">
              <span class="oi-name">${item.name}</span>
              <div class="oi-serve-controls">
                <button class="oi-step" data-action="serve-dec" data-oid="${ord.parentId}" data-idx="${item.sourceIndex}" ${item.served <= 0 ? "disabled" : ""} aria-label="${item.name}の配膳数を1減らす">−</button>
                <span class="oi-qty">${item.served}/${item.qty}</span>
                <button class="oi-step" data-action="serve-inc" data-oid="${ord.parentId}" data-idx="${item.sourceIndex}" ${item.served >= item.qty ? "disabled" : ""} aria-label="${item.name}の配膳数を1増やす">＋</button>
              </div>
              <div class="oi-chk${item.served>=item.qty?" done":""}" data-oid="${ord.parentId}" data-idx="${item.sourceIndex}" title="全数配膳の切替">${item.served>=item.qty?"✓":""}</div>
            </div>`).join("")}
        </div>
        <div class="oc-foot">
          <div class="oc-tot">¥${total.toLocaleString()}</div>
          <div class="service-note${done?" done":""}">${done?"全品配膳済み":`未提供 ${pendingQty}点`}</div>
        </div>
      </div>`;
    }).join("");
  }

  function updateServedQty(orderId, itemIndex, nextServed) {
    const ord = orders.find(order => order.id === orderId);
    if (!ord) return;

    const item = ord.items[itemIndex];
    if (!item) return;

    item.served = Math.max(0, Math.min(item.qty, nextServed));
    persistMockServedQty(ord);
    renderOrders();
    renderHome(false);
  }

  $("orderList").addEventListener("click", e => {
    const step = e.target.closest(".oi-step");
    if (step) {
      const orderId = step.dataset.oid;
      const itemIndex = Number(step.dataset.idx);
      const ord = orders.find(order => order.id === orderId);
      const item = ord?.items[itemIndex];
      if (!item) return;

      const delta = step.dataset.action === "serve-inc" ? 1 : -1;
      updateServedQty(orderId, itemIndex, item.served + delta);
      return;
    }

    const chk = e.target.closest(".oi-chk");
    if (!chk) return;

    const orderId = chk.dataset.oid;
    const itemIndex = Number(chk.dataset.idx);
    const ord = orders.find(order => order.id === orderId);
    const item = ord?.items[itemIndex];
    if (!item) return;

    updateServedQty(orderId, itemIndex, item.served < item.qty ? item.qty : 0);
  });

  // ──────────────────────────────────────────────────
  // 会計管理
  // ──────────────────────────────────────────────────
  function getBillingSessions() {
    const sessions = new Map();
    orders.forEach(order => {
      const key = order.customerId || order.id;
      if (!sessions.has(key)) {
        sessions.set(key, {
          customerId: order.customerId,
          tableNo: order.tableNo,
          guests: order.guests,
          time: order.time,
          status: order.status,
          orders: [],
          itemCount: 0,
          total: M.getCourse(order.courseId)?.price * order.guests || 0,
        });
      }
      const session = sessions.get(key);
      session.orders.push(order);
      session.itemCount += order.items.reduce((sum, item) => sum + item.qty, 0);
      session.total += order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
    });
    return Array.from(sessions.values()).filter(session => [1, 2, 4, 8].includes(session.status));
  }

  function renderBilling() {
    const sessions = getBillingSessions();
    const waitingCount = sessions.filter(session => session.status === 1).length;
    $("billingSub").textContent =
      `会計待ち ${waitingCount}組 ／ 会計依頼 ${activeCheckoutCount()}件`;

    const list = $("billingList");
    if (sessions.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="em">💴</div><p>会計対象の卓はありません</p></div>`;
      return;
    }

    list.innerHTML = sessions.map(session => {
      const request = activeCheckoutRequestForCustomer(session.customerId);
      const requestTime = request && request.requestedAt ? String(request.requestedAt).slice(11, 16) : null;
      const billingStarted = session.status === 8;
      const billStatus = M.BILL_STATUS[session.status] || { label: "不明", color: "#94a3b8" };
      const statusClass =
        session.status === 8 ? "started" :
        session.status === 2 ? "paid" :
        session.status === 4 ? "unpaid" :
        "waiting";
      return `<div class="billing-card${billingStarted?" started":""}" data-customer-id="${session.customerId}">
        <div class="billing-head">
          <div>
            <div class="billing-table">🪑 ${session.tableNo}</div>
            <div class="billing-meta">customerId: ${session.customerId || "-"} ／ ${session.guests}名 ／ 入店 ${session.time}</div>
          </div>
          <span class="billing-status ${statusClass}">${billStatus.label}</span>
        </div>
        <div class="billing-body">
          <div class="billing-total">¥${session.total.toLocaleString()}</div>
          <div class="billing-summary">${session.orders.length}注文 ／ ${session.itemCount}点</div>
          ${request ? `<div class="billing-request ${request.status}">会計依頼あり${requestTime ? ` （${requestTime}）` : ""}</div>` : ""}
        </div>
        <div class="billing-foot">
          ${session.status === 1
            ? `<button class="btn btn-or" data-action="start-billing" data-customer-id="${session.customerId}">会計開始</button>`
            : `<span class="billing-note">${session.status === 8 ? "レジ側で会計処理中" : "レジ側の会計状態を表示中"}</span>`}
        </div>
        ${M.API_CONFIG.USE_MOCK ? `
          <div class="billing-pos-demo">
            <span class="pos-demo-lbl">レジ通知デモ</span>
            <div class="pos-demo-actions">
              ${[1, 8, 2, 4].map(status => `
                <button
                  class="pos-btn${session.status === status ? " active" : ""}"
                  data-action="simulate-pos-status"
                  data-customer-id="${session.customerId}"
                  data-status="${status}">
                  ${M.BILL_STATUS[status].label}
                </button>`).join("")}
            </div>
          </div>` : ""}
      </div>`;
    }).join("");
  }

  function startBilling(customerId) {
    const session = getBillingSessions().find(item => item.customerId === customerId);
    if (!session || session.status !== 1) return;

    const previousOrders = orders.map(order => ({ ...order }));
    applyLocalSessionStatus(customerId, 8);
    renderBilling();
    renderHome(false);

    M.apiPost(M.buildUpdateStatusReq({
      customerId,
      hash: null,
      billStatus: 8,
    }))
      .then(res => {
        if (!res.ok) {
          orders = previousOrders;
          renderBilling();
          renderHome(false);
          toast("⚠️ 会計開始に失敗しました");
          return;
        }
        resolveCheckoutRequestForCustomer(customerId);
        toast(`✅ ${session.tableNo}の会計を開始しました`);
      })
      .catch(() => {
        orders = previousOrders;
        renderBilling();
        renderHome(false);
        toast("⚠️ 会計開始に失敗しました");
      });
  }

  function simulatePosStatus(customerId, nextStatus) {
    const session = getBillingSessions().find(item => item.customerId === customerId);
    if (!session || !M.BILL_STATUS[nextStatus]) return;

    const previousOrders = orders.map(order => ({ ...order }));
    applyLocalSessionStatus(customerId, nextStatus);
    renderBilling();
    renderHome(false);

    M.apiPost(M.buildUpdateStatusReq({
      customerId,
      hash: null,
      billStatus: nextStatus,
    }))
      .then(res => {
        if (!res.ok) {
          orders = previousOrders;
          renderBilling();
          renderHome(false);
          toast("⚠️ レジ通知デモの反映に失敗しました");
          return;
        }
        if (nextStatus === 1) {
          resolveCheckoutRequestForCustomer(customerId);
        }
        toast(`📨 レジから「${M.BILL_STATUS[nextStatus].label}」の通知を受信しました`);
      })
      .catch(() => {
        orders = previousOrders;
        renderBilling();
        renderHome(false);
        toast("⚠️ レジ通知デモの反映に失敗しました");
      });
  }

  $("billingList").addEventListener("click", e => {
    const startButton = e.target.closest('[data-action="start-billing"]');
    if (startButton) {
      startBilling(startButton.dataset.customerId);
      return;
    }

    const posButton = e.target.closest('[data-action="simulate-pos-status"]');
    if (!posButton) return;
    simulatePosStatus(posButton.dataset.customerId, Number(posButton.dataset.status));
  });

  // ──────────────────────────────────────────────────
  // 卓管理
  // ──────────────────────────────────────────────────
  function renderTables() {
    renderStatusMgmt();
    renderTableAreas();
    renderColorDots();
  }

  function renderStatusMgmt() {
    $("statusList").innerHTML = statuses.map(s => {
      const cnt = tables.filter(t => t.status === s.id).length;
      return `<div class="si">
        <div class="si-dot" style="background:${s.color}"></div>
        <span class="si-lbl">${s.label}</span>
        <span class="si-cnt" style="background:${s.color}22;color:${s.color}">${cnt}卓</span>
        ${s.fixed
          ? `<span style="font-size:.6rem;color:var(--tx2)">デフォルト</span>`
          : `<button class="btn btn-ghost btn-sm" data-del-status="${s.id}">削除</button>`}
      </div>`;
    }).join("");
    $("statusList").querySelectorAll("[data-del-status]").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.dataset.delStatus;
        statuses = statuses.filter(s => s.id !== id);
        tables   = tables.map(t => t.status === id ? {...t, status:"empty"} : t);
        toast("🗑 ステータスを削除しました");
        renderTables();
      });
    });
  }

  function renderColorDots() {
    $("colorDots").innerHTML = COLOR_OPTS.map(c =>
      `<div class="cdot${newStatusColor===c?" on":""}" style="background:${c}" data-color="${c}"></div>`
    ).join("");
    $("colorDots").querySelectorAll(".cdot").forEach(d => {
      d.addEventListener("click", () => { newStatusColor = d.dataset.color; renderColorDots(); });
    });
  }

  $("btnAddStatus").addEventListener("click", () => {
    const lbl = $("newStatusLabel").value.trim();
    if (!lbl) return;
    statuses.push({ id: "c_" + Date.now(), label: lbl, color: newStatusColor, fixed: false });
    $("newStatusLabel").value = "";
    toast(`✅ ステータス「${lbl}」を追加しました`);
    renderTables();
  });

  function renderTableAreas() {
    const areas = [...new Set(tables.map(t => t.area))];
    $("tableAreas").innerHTML = areas.map(area => {
      const rows = tables.filter(t => t.area === area).map(tbl => {
        const st = statuses.find(s => s.id === tbl.status) || statuses[0];
        const linked = orders.find(o => o.id === tbl.orderId);
        const infoHtml = linked
          ? `<span class="t-info" style="background:var(--orp)22;color:var(--orl)">${linked.guests}名 | ${M.BILL_STATUS[linked.status]?.label}</span>`
          : tbl.status === "occupied"
            ? `<span class="t-info" style="background:var(--bg3);color:var(--tx2)">注文なし</span>` : "";
        const opts = statuses.map(s => `<option value="${s.id}"${s.id===tbl.status?" selected":""}>${s.label}</option>`).join("");
        return `<div class="t-row" style="border-left:3px solid ${st.color}">
          <div class="t-no">${tbl.no}</div>
          <div class="t-seats">💺${tbl.seats}</div>
          <select class="t-sel" data-tid="${tbl.id}"
            style="color:${st.color};background:${st.color}15;border:1px solid ${st.color}55">${opts}</select>
          ${infoHtml}
        </div>`;
      }).join("");
      return `<div class="area-sec"><div class="area-lbl">${area}</div><div class="t-list">${rows}</div></div>`;
    }).join("");
    $("tableAreas").querySelectorAll(".t-sel").forEach(sel => {
      sel.addEventListener("change", () => {
        tables = tables.map(t => t.id === sel.dataset.tid ? {...t, status: sel.value} : t);
        renderTables();
      });
    });
  }

  // ─────────────────────────────────────────────────
  // スタッフ管理
  // ─────────────────────────────────────────────────
  const AV_COLORS = ["#e8621a","#c9a227","#5c6e3a","#6366f1","#ec4899","#0ea5e9"];

  function renderStaff() {
    $("staffSub").textContent = `${staffList.filter(s=>s.active).length}名 在籍中`;
    $("staffList").innerHTML = staffList.map(s => `
      <div class="s-row${!s.active?" off":""}">
        <div class="s-av" style="background:${AV_COLORS[s.colorIdx % AV_COLORS.length]}">${s.name[0]}</div>
        <div class="s-info">
          <div class="s-name">${s.name}</div>
          <div class="s-meta">
            <span class="s-rtag" style="${s.role==="manager"?"background:rgba(245,208,0,.12);color:#f5d06a":"background:var(--orp)22;color:var(--orl)"}">${s.role==="manager"?"👑 管理職":"👤 スタッフ"}</span>
            <span class="s-id">ID: ${s.id}</span>
            <span class="s-pw">PW: ${s.password}</span>
            <span class="s-join">入社: ${s.joinDate}</span>
          </div>
        </div>
        <div class="s-acts">
          <button class="btn btn-sm ${s.active?"btn-ghost":"btn-or"}" data-toggle="${s.id}">${s.active?"無効化":"有効化"}</button>
          <button class="btn btn-sm btn-danger" data-del-staff="${s.id}" data-name="${s.name}">削除</button>
        </div>
      </div>`).join("");

    $("staffList").querySelectorAll("[data-toggle]").forEach(b => {
      b.addEventListener("click", () => {
        staffList = staffList.map(s => s.id===b.dataset.toggle ? {...s,active:!s.active} : s);
        renderStaff();
      });
    });
    $("staffList").querySelectorAll("[data-del-staff]").forEach(b => {
      b.addEventListener("click", () => openModal(
        "スタッフを削除しますか？",
        `「${b.dataset.name}」を削除します。この操作は元に戻せません。`,
        () => {
          staffList = staffList.filter(s => s.id !== b.dataset.delStaff);
          toast(`🗑 ${b.dataset.name} さんを削除しました`);
          renderStaff();
        }
      ));
    });
  }

  $("btnAddStaff").addEventListener("click", () => {
    const code = $("newStaffCode").value.trim().toUpperCase();
    const name = $("newStaffName").value.trim();
    const pw   = $("newStaffPw").value.trim();
    const role = $("newStaffRole").value;
    if (!code || !name || !pw) return;
    staffList.push({ id: code, name, password: pw, role, joinDate: new Date().toISOString().slice(0,10), active: true, colorIdx: staffList.length, hue: 200 });
    [$("newStaffCode"),$("newStaffName"),$("newStaffPw")].forEach(el => el.value = "");
    toast(`✅ ${name} さんを追加しました`);
    renderStaff();
  });

  // ─────────────────────────────────────────────────
  // 売上レポート
  // ─────────────────────────────────────────────────
  function renderSales() {
    const allData = salesRowsWithToday();
    const data = allData.slice(-(salesRange + 1));
    const today = allData[allData.length-1];
    const historicalData = data.slice(0, -1);
    const total = historicalData.reduce((s,d)=>s+d.s,0);
    const avg   = historicalData.length > 0 ? Math.round(total / historicalData.length) : 0;
    const maxS  = Math.max(...data.map(d=>d.s), 1);
    const peak  = historicalData.reduce((best, row) => row.s > best.s ? row : best, historicalData[0] || today);

    $("salesRangeFilters").innerHTML = [
      [7, "7日"],
      [30, "30日"],
      [60, "60日"],
    ].map(([value, label]) =>
      `<button class="of${salesRange===value?" on":""}" data-sales-range="${value}">${label}</button>`
    ).join("");

    $("kpiRow").innerHTML = [
      { l:"本日の売上",   v:`¥${today.s.toLocaleString()}`, s:`注文${today.o}件/${today.g}名`, hi:true  },
      { l:`過去${salesRange}日売上`, v:`¥${total.toLocaleString()}`, s:`過去${historicalData.length}日間`, hi:false },
      { l:"日次平均売上", v:`¥${avg.toLocaleString()}`,     s:`過去${historicalData.length}日の平均`, hi:false },
      { l:"ピーク日",     v:peak.d,                         s:`¥${peak.s.toLocaleString()}`, hi:false },
    ].map(k => `<div class="kpi">
      <div class="kpi-l">${k.l}</div>
      <div class="kpi-v${k.hi?" hi":""}">${k.v}</div>
      <div class="kpi-s">${k.s}</div>
    </div>`).join("");

    $("barChart").innerHTML = data.map((d, i) => {
      const h  = Math.round((d.s/maxS)*120);
      const isT = i === data.length-1;
      return `<div class="bc-col">
        <div class="bc-top">¥${d.s.toLocaleString()}</div>
        <div class="bc-bar" style="height:${h}px;background:${isT?"linear-gradient(to top,#e8621a,#f97316)":"linear-gradient(to top,#2a1d13,#362519)"};${isT?"box-shadow:0 0 16px rgba(232,98,26,.4);border:1px solid rgba(232,98,26,.4)":"border:1px solid var(--line)"}"></div>
        <div class="bc-lbl">${d.d}</div>
      </div>`;
    }).join("");

    $("salesTable").innerHTML = [...data].reverse().map((d, i) =>
      `<tr class="${i===0?"today":""}">
        <td>${d.d}${i===0?" 🔴":""}</td>
        <td>¥${d.s.toLocaleString()}</td>
        <td>${d.o}件</td>
        <td>${d.g}名</td>
        <td>${d.g > 0 ? `¥${Math.round(d.s/d.g).toLocaleString()}` : "¥0"}</td>
      </tr>`
    ).join("");

    renderBillingHistory();
  }

  function renderBillingHistory() {
    const allRows = billingHistoryRows();
    const today = todayKey();
    const cutoffDate = function(days) {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
    };

    const filtered = allRows
      .filter(row => {
        if (billingHistoryRange === "today") return row.date === today;
        return row.date >= cutoffDate(Number(billingHistoryRange));
      })
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    $("billingHistoryFilters").innerHTML = [
      ["today", "本日"],
      ["7", "過去7日"],
      ["30", "過去30日"],
      ["60", "過去60日"],
    ].map(([value, label]) =>
      `<button class="of${billingHistoryRange===value?" on":""}" data-billing-history-range="${value}">${label}</button>`
    ).join("");

    $("billingHistoryTable").innerHTML = filtered.length > 0
      ? filtered.map(row => `
        <tr class="${row.date === today ? "today" : ""}">
          <td>${row.d}</td>
          <td>${row.time}</td>
          <td>${row.tableNo}</td>
          <td>${row.guests}名</td>
          <td>¥${row.total.toLocaleString()}</td>
          <td>${M.BILL_STATUS[row.status]?.label || "会計済み"}</td>
        </tr>`).join("")
      : `<tr><td colspan="6" class="empty-cell">表示できる会計履歴はありません</td></tr>`;
  }

  $("salesRangeFilters").addEventListener("click", e => {
    const button = e.target.closest("[data-sales-range]");
    if (!button) return;
    salesRange = Number(button.dataset.salesRange);
    renderSales();
  });

  $("billingHistoryFilters").addEventListener("click", e => {
    const button = e.target.closest("[data-billing-history-range]");
    if (!button) return;
    billingHistoryRange = button.dataset.billingHistoryRange;
    renderBillingHistory();
  });

  // ─────────────────────────────────────────────────
  // モーダル
  // ─────────────────────────────────────────────────
  function openModal(title, body, onConfirm) {
    $("moTitle").textContent = title;
    $("moBody").textContent  = body;
    $("moDelete").classList.remove("hidden");
    deleteCallback = onConfirm;
  }
  $("btnMoCancel").addEventListener("click",  () => $("moDelete").classList.add("hidden"));
  $("btnMoConfirm").addEventListener("click", () => {
    $("moDelete").classList.add("hidden");
    if (deleteCallback) deleteCallback();
    deleteCallback = null;
  });
  $("moDelete").addEventListener("click", e => { if (e.target === $("moDelete")) $("moDelete").classList.add("hidden"); });

  // ─────────────────────────────────────────────────
  // 初期化
  // ─────────────────────────────────────────────────
  window.addEventListener("storage", event => {
    if (!currentUser || event.key !== "mos_checkout_requests_v2") return;
    refreshCheckoutRequestsFromApi().then(renderRealtimeCheckoutViews);
  });

  showScreen("screenLogin");
  $("sApp").classList.add("hidden");

})();

