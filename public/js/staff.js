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
  const SCREENS = ["screenLogin","screenHome","screenOrders","screenTables","screenStaff","screenSales"];
  function showScreen(id) {
    SCREENS.forEach(s => {
      const el = $(s);
      if (el) el.classList.toggle("active", el.id === id);
    });
    const isHome  = id === "screenHome";
    const isInner = ["screenOrders","screenTables","screenStaff","screenSales"].includes(id);
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

  // ─────────────────────────────────────────────────
  // ログイン
  // ─────────────────────────────────────────────────
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
    renderHome();
    showScreen("screenHome");
    toast(`✅ ようこそ、${acc.name} さん`);
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
    currentUser = null;
    $("inputStaffId").value = "";
    $("inputPassword").value = "";
    showScreen("screenLogin");
  });
  $("btnGoHome").addEventListener("click", () => {
    renderHome(); showScreen("screenHome");
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
    // 呼び出し通知（デモ）
    const notif = $("callNotif");
    $("callNotifTxt").textContent = "スタッフ呼び出し：1F-2番テーブル（20:34）";
    notif.classList.remove("hidden");
    $("btnDismissNotif").addEventListener("click", () => {
      notif.classList.add("hidden");
      toast("📍 1F-2番テーブルを確認済みにしました");
    }, { once: true });
  }

  // ─────────────────────────────────────────────────
  // ホーム画面
  // ─────────────────────────────────────────────────
  const FEATURES = [
    { key:"orders", label:"注文管理",    sub:"受付・提供チェック・会計処理", icon:"📋", accent:"#e8621a", roles:["staff","manager"] },
    { key:"tables", label:"卓管理",      sub:"テーブル状況・ステータス管理", icon:"🪑", accent:"#22c55e", roles:["staff","manager"] },
    { key:"staff",  label:"スタッフ管理",sub:"アカウント追加・削除・権限",   icon:"👥", accent:"#818cf8", roles:["manager"] },
    { key:"sales",  label:"売上レポート",sub:"日次・週次の売上推移",          icon:"📊", accent:"#f59e0b", roles:["manager"] },
  ];

  function renderHome() {
    if (!currentUser) return;
    const waiting = orders.filter(o => o.status === 1).length;
    const billing = orders.filter(o => o.status === 8).length;
    const paid    = orders.filter(o => o.status === 2).length;
    const todayS  = M.SALES_DATA[M.SALES_DATA.length-1].s;

    $("homeGreet").textContent = `こんにちは、${currentUser.name.split(" ")[0]}さん 👋`;
    $("homeDate").textContent  = new Date().toLocaleDateString("ja-JP", {month:"long",day:"numeric",weekday:"short"}) + " · 緑橋一号店";

    $("homeStats").innerHTML = [
      { v:waiting,                    l:"受付中",  or:true  },
      { v:billing,                    l:"会計中",  or:false },
      { v:paid,                       l:"会計済み",or:false },
      { v:`¥${Math.round(todayS/1000)}K`, l:"本日売上",or:true  },
    ].map(s => `<div class="stat"><div class="stat-v${s.or?" or":""}">${s.v}</div><div class="stat-l">${s.l}</div></div>`).join("");

    const visible = FEATURES.filter(f => f.roles.includes(currentUser.role));
    $("featureGrid").innerHTML = visible.map((f, i) => `
      <div class="fc" style="animation-delay:${i*55}ms" data-feature="${f.key}">
        <div class="fc-body">
          <span class="fc-icon">${f.icon}</span>
          <div class="fc-name">${f.label}</div>
          <div class="fc-sub">${f.sub}</div>
        </div>
        <div class="fc-foot" style="background:${f.accent}18">
          <span class="fc-tag" style="background:${f.accent}">
            ${f.key==="orders"&&waiting>0?`受付中 ${waiting}件`:"利用可能"}
          </span>
          <span class="fc-arr" style="color:${f.accent}">→</span>
        </div>
      </div>`).join("");

    $("featureGrid").addEventListener("click", e => {
      const fc = e.target.closest(".fc");
      if (!fc) return;
      navigateTo(fc.dataset.feature);
    });
  }

  function navigateTo(key) {
    const actions = {
      orders: () => { renderOrders();  showScreen("screenOrders"); },
      tables: () => { renderTables();  showScreen("screenTables"); },
      staff:  () => { renderStaff();   showScreen("screenStaff");  },
      sales:  () => { renderSales();   showScreen("screenSales");  },
    };
    actions[key]?.();
  }

  // ─────────────────────────────────────────────────
  // 注文管理
  // ─────────────────────────────────────────────────
  let orderFilter = 0;
  const OF_DEFS = [[0,"すべて"],[1,"受付中"],[8,"会計中"],[2,"会計済み"],[4,"未収金"]];

  function renderOrders() {
    $("ordersSub").textContent =
      `受付中 ${orders.filter(o=>o.status===1).length}件 ／ 会計中 ${orders.filter(o=>o.status===8).length}件`;

    // フィルターバー
    $("orderFilters").innerHTML = OF_DEFS.map(([v,l]) =>
      `<button class="of${orderFilter===v?" on":""}" data-v="${v}">${l} <span style="opacity:.55">(${v===0?orders.length:orders.filter(o=>o.status===v).length})</span></button>`
    ).join("");
    $("orderFilters").querySelectorAll(".of").forEach(b => {
      b.addEventListener("click", () => { orderFilter = Number(b.dataset.v); renderOrders(); });
    });

    const list = $("orderList");
    const filtered = orderFilter === 0 ? orders : orders.filter(o => o.status === orderFilter);
    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="em">📋</div><p>該当する注文はありません</p></div>`;
      return;
    }
    list.innerHTML = filtered.map(ord => {
      const c  = M.getCourse(ord.courseId);
      const bs = M.BILL_STATUS[ord.status];
      const tot = ord.items.reduce((s,i) => s + i.price * i.qty, 0);
      return `<div class="oc${ord.status===8?" billing":""}${ord.status===2?" paid":""}" data-id="${ord.id}">
        <div class="oc-head">
          <div>
            <div class="oc-tbl">🪑 ${ord.tableNo}</div>
            <div class="oc-meta">
              ${c?`<span class="tag" style="background:${c.color}">${c.shortLabel}</span>`:""}
              <span style="font-size:.68rem;color:var(--tx2)">${ord.guests}名</span>
            </div>
            <div class="oc-id">ID:${ord.id} | 入店 ${ord.time}</div>
          </div>
          <span class="bs" style="background:${bs?.color}">${bs?.label}</span>
        </div>
        <div class="oc-items">
          ${ord.items.map((it,idx) => `
            <div class="oi-row">
              <span class="oi-name">${it.name}</span>
              <span class="oi-qty">${it.served}/${it.qty}</span>
              <div class="oi-chk${it.served>=it.qty?" done":""}" data-oid="${ord.id}" data-idx="${idx}">${it.served>=it.qty?"✓":""}</div>
            </div>`).join("")}
        </div>
        <div class="oc-foot">
          <div class="oc-tot">¥${tot.toLocaleString()}</div>
          <div class="oc-acts">
            ${ord.status===1?`<button class="ocb bl" data-action="billing" data-oid="${ord.id}">会計開始</button>`:""}
            ${ord.status===8?`<button class="ocb rs" data-action="reset" data-oid="${ord.id}">戻す</button>
                              <button class="ocb pd" data-action="paid"  data-oid="${ord.id}">会計済み</button>`:""}
            ${ord.status===4?`<button class="ocb ur" data-action="collect" data-oid="${ord.id}">回収済み</button>`:""}
            ${ord.status===2?`<span style="font-size:.68rem;color:var(--tx2)">✅ 完了</span>`:""}
          </div>
        </div>
      </div>`;
    }).join("");

    // イベント委譲
    list.addEventListener("click", e => {
      // チェック
      const chk = e.target.closest(".oi-chk");
      if (chk) {
        const oid = chk.dataset.oid, idx = Number(chk.dataset.idx);
        const ord = orders.find(o => o.id === oid);
        if (ord) {
          const it = ord.items[idx];
          it.served = it.served < it.qty ? it.qty : 0;
          renderOrders();
        }
        return;
      }
      // アクション
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const oid = btn.dataset.oid, action = btn.dataset.action;
      const statusMap = { billing: 8, reset: 1, paid: 2, collect: 2 };
      const newSt = statusMap[action];
      orders = orders.map(o => o.id === oid ? {...o, status: newSt} : o);
      const lblMap = { billing:`💳 ${oid} 会計開始`, paid:`✅ ${oid} 会計完了`, collect:"✅ 未収金を回収しました" };
      if (lblMap[action]) toast(lblMap[action]);
      renderOrders();
    });
  }

  // ─────────────────────────────────────────────────
  // 卓管理
  // ─────────────────────────────────────────────────
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
    const data  = M.SALES_DATA;
    const today = data[data.length-1];
    const total = data.reduce((s,d)=>s+d.s,0);
    const avg   = Math.round(total/data.length);
    const maxS  = Math.max(...data.map(d=>d.s));

    $("kpiRow").innerHTML = [
      { l:"本日の売上",   v:`¥${today.s.toLocaleString()}`, s:`注文${today.o}件/${today.g}名`, hi:true  },
      { l:"週間売上合計", v:`¥${total.toLocaleString()}`,   s:"過去7日間",                     hi:false },
      { l:"日次平均売上", v:`¥${avg.toLocaleString()}`,     s:"過去7日の平均",                 hi:false },
      { l:"ピーク日",     v:data.find(d=>d.s===maxS)?.d,   s:`¥${maxS.toLocaleString()}`,    hi:false },
    ].map(k => `<div class="kpi">
      <div class="kpi-l">${k.l}</div>
      <div class="kpi-v${k.hi?" hi":""}">${k.v}</div>
      <div class="kpi-s">${k.s}</div>
    </div>`).join("");

    $("barChart").innerHTML = data.map((d, i) => {
      const h  = Math.round((d.s/maxS)*100);
      const isT = i === data.length-1;
      return `<div class="bc-col">
        <div class="bc-top">${Math.round(d.s/1000)}K</div>
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
        <td>¥${Math.round(d.s/d.g).toLocaleString()}</td>
      </tr>`
    ).join("");
  }

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
  showScreen("screenLogin");
  $("sApp").classList.add("hidden");

})();
