/**
 * js/api.js
 * 居酒屋みどり亭 MOS — API通信層
 * API仕様書 Ver.2.1.0 準拠
 *
 * 本番実装時: USE_MOCK = false に変更し、
 *             ENDPOINT を実際のサーバURLに変更する
 * ロード順: data.js → api.js → customer.js / staff.js
 */

window.MOS = window.MOS || {};

// ─────────────────────────────────────────
// 設定
// ─────────────────────────────────────────
window.MOS.API_CONFIG = {
  USE_MOCK: true,       // true=モック / false=実API
  ENDPOINT: "/api/orders",
  CHECKOUT_ENDPOINT: "/api/checkout-requests",
  TIMEOUT_MS: 3000,
};

// ─────────────────────────────────────────
// リクエストビルダー
// ─────────────────────────────────────────
window.MOS.buildGetOrdersReq = function(opts) {
  var o = opts || {};
  return {
    method:     "getOrders",
    customerId: o.customerId !== undefined ? o.customerId : null,
    billStatus: o.billStatus !== undefined ? o.billStatus : null,
    fromTime:   o.fromTime   !== undefined ? o.fromTime   : null,
    toTime:     o.toTime     !== undefined ? o.toTime     : null,
  };
};

window.MOS.buildCreateOrderReq = function(opts) {
  var o = opts || {};
  return {
    method:     "createOrder",
    storeId:    o.storeId,
    customerId: o.customerId,
    tableNo:    o.tableNo,
    guestCount: o.guestCount,
    courseKey:  o.courseKey !== undefined ? o.courseKey : null,
    entryTime:  o.entryTime,
    items:      Array.isArray(o.items) ? o.items : [],
  };
};

window.MOS.buildUpdateStatusReq = function(opts) {
  var o = opts || {};
  return {
    method:     "updateStatus",
    customerId: o.customerId,
    hash:       o.hash !== undefined ? o.hash : null,
    billStatus: o.billStatus,
  };
};

window.MOS.buildRequestCheckoutReq = function(opts) {
  var o = opts || {};
  return {
    method:     "requestCheckout",
    customerId: o.customerId,
    tableNo:    o.tableNo,
    orderHash:  o.orderHash !== undefined ? o.orderHash : null,
  };
};

window.MOS.buildGetCheckoutRequestsReq = function(opts) {
  var o = opts || {};
  return {
    method:     "getCheckoutRequests",
    customerId: o.customerId !== undefined ? o.customerId : null,
    status:     o.status !== undefined ? o.status : null,
  };
};

window.MOS.buildUpdateCheckoutRequestStatusReq = function(opts) {
  var o = opts || {};
  return {
    method:    "updateCheckoutRequestStatus",
    requestId: o.requestId,
    status:    o.status,
  };
};

// ─────────────────────────────────────────
// モック実装（USE_MOCK=true 時に使用）
// ─────────────────────────────────────────
window.MOS._mockOrderStorageKey = "mos_orders_v2";

window.MOS._toMockIsoDateTime = function(timeText, dayOffset) {
  var base = new Date();
  base.setDate(base.getDate() + (dayOffset || 0));
  var parts = String(timeText || "19:00").split(":");
  base.setHours(Number(parts[0] || 19), Number(parts[1] || 0), 0, 0);
  var pad = function(n) { return String(n).padStart(2, "0"); };
  return [
    base.getFullYear(), "-",
    pad(base.getMonth() + 1), "-",
    pad(base.getDate()), "T",
    pad(base.getHours()), ":",
    pad(base.getMinutes()), ":00",
  ].join("");
};

window.MOS._seedMockOrders = function() {
  return (window.MOS.SEED_ORDERS || []).map(function(order, index) {
    return {
      hash: "seed" + String(index + 1).padStart(4, "0"),
      storeId: "AA",
      entryTime: window.MOS._toMockIsoDateTime(order.time, 0),
      customerId: String(9000001 + index).padStart(7, "0"),
      billStatus: order.status,
      guestCount: order.guests,
      courseKey: order.courseId,
      tableNo: order.tableNo,
      items: order.items.map(function(item) {
        return {
          orderTime: window.MOS._toMockIsoDateTime(order.time, 0),
          menuName: item.name,
          unitPrice: item.price,
          taxRate: 10,
          orderQty: item.qty,
          offerQty: item.served,
          categoryName: null,
        };
      }),
    };
  });
};

window.MOS._readMockOrders = function() {
  try {
    var raw = localStorage.getItem(window.MOS._mockOrderStorageKey);
    if (raw) {
      var stored = JSON.parse(raw);
      var withoutLegacySeeds = stored.filter(function(order) {
        return !/^seed000[1-3]$/.test(order.hash || "");
      });
      if (withoutLegacySeeds.length !== stored.length) {
        window.MOS._writeMockOrders(withoutLegacySeeds);
      }
      return withoutLegacySeeds;
    }
  } catch (e) {
    // fall through to seed
  }
  var seeded = window.MOS._seedMockOrders();
  window.MOS._writeMockOrders(seeded);
  return seeded;
};

window.MOS._writeMockOrders = function(orders) {
  localStorage.setItem(window.MOS._mockOrderStorageKey, JSON.stringify(orders));
};

window.MOS._matchesMockOrderFilter = function(order, payload) {
  var customerOk = payload.customerId === null || payload.customerId === undefined || order.customerId === payload.customerId;
  var statusOk = payload.billStatus === null || payload.billStatus === undefined || (order.billStatus & payload.billStatus) > 0;
  var fromOk = payload.fromTime === null || payload.fromTime === undefined || order.entryTime >= payload.fromTime;
  var toOk = payload.toTime === null || payload.toTime === undefined || order.entryTime <= payload.toTime;
  return customerOk && statusOk && fromOk && toOk;
};

window.MOS._mockApiPost = function(payload) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      if (payload.method === "getOrders") {
        var orders = window.MOS._readMockOrders()
          .filter(function(order) {
            return window.MOS._matchesMockOrderFilter(order, payload);
          })
          .sort(function(a, b) {
            return String(b.entryTime).localeCompare(String(a.entryTime));
          });
        if (payload.customerId !== null && payload.customerId !== undefined) {
          orders = orders.slice(0, 1);
        }
        resolve({ ok: true, data: orders });
        return;
      }
      if (payload.method === "createOrder") {
        var now = new Date().toISOString();
        var nextOrders = window.MOS._readMockOrders();
        var existingIndex = nextOrders.findIndex(function(order) {
          return order.customerId === payload.customerId;
        });
        var appendedItems = (payload.items || []).map(function(item) {
          return {
            orderTime: item.orderTime || now.slice(0, 19),
            menuName: item.menuName,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            orderQty: item.orderQty,
            offerQty: item.offerQty,
            categoryName: item.categoryName,
          };
        });
        var created;

        if (existingIndex >= 0) {
          var existing = nextOrders[existingIndex];
          if (existing.billStatus !== 1) {
            resolve({
              ok: false,
              error: {
                errorCode: "INVALID_REQUEST",
                message: "Cannot add items after billing has started.",
              },
            });
            return;
          }
          created = Object.assign({}, existing, {
            items: existing.items.concat(appendedItems),
          });
          nextOrders[existingIndex] = created;
        } else {
          created = {
            hash: "mock" + Date.now().toString(16),
            storeId: payload.storeId,
            entryTime: payload.entryTime,
            customerId: payload.customerId,
            billStatus: 1,
            guestCount: payload.guestCount,
            courseKey: payload.courseKey,
            tableNo: payload.tableNo,
            items: appendedItems,
          };
          nextOrders.unshift(created);
        }

        window.MOS._writeMockOrders(nextOrders);
        resolve({
          ok: true,
          data: created,
        });
        return;
      }
      if (payload.method === "updateStatus") {
        var updatedOrders = window.MOS._readMockOrders();
        var targetIndex = -1;
        if (payload.hash) {
          targetIndex = updatedOrders.findIndex(function(order) {
            return order.hash === payload.hash && order.customerId === payload.customerId;
          });
        } else {
          targetIndex = updatedOrders.findIndex(function(order) {
            return order.customerId === payload.customerId;
          });
        }
        if (targetIndex >= 0) {
          updatedOrders[targetIndex] = Object.assign({}, updatedOrders[targetIndex], {
            billStatus: payload.billStatus,
          });
          window.MOS._writeMockOrders(updatedOrders);
        }
        resolve({ ok: true, data: null });
        return;
      }
      resolve({
        ok: false,
        error: {
          errorCode: "INVALID_REQUEST",
          message: "Unknown method: " + payload.method,
        },
      });
    }, 280);
  });
};

window.MOS._readMockCheckoutRequests = function() {
  try {
    return JSON.parse(localStorage.getItem("mos_checkout_requests_v2") || "[]");
  } catch (e) {
    return [];
  }
};

window.MOS._writeMockCheckoutRequests = function(requests) {
  localStorage.setItem("mos_checkout_requests_v2", JSON.stringify(requests));
};

window.MOS._mockCheckoutApiPost = function(payload) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      var requests = window.MOS._readMockCheckoutRequests();

      if (payload.method === "requestCheckout") {
        var existing = requests.find(function(req) {
          return req.customerId === payload.customerId &&
            (req.status === "pending" || req.status === "acknowledged");
        });
        if (existing) {
          resolve({ ok: true, data: existing });
          return;
        }

        var now = new Date().toISOString();
        var created = {
          id: Date.now(),
          customerId: payload.customerId,
          orderHash: payload.orderHash || null,
          tableNo: payload.tableNo,
          status: "pending",
          requestedAt: now,
          acknowledgedAt: null,
          resolvedAt: null,
        };
        requests.unshift(created);
        window.MOS._writeMockCheckoutRequests(requests);
        resolve({ ok: true, data: created });
        return;
      }

      if (payload.method === "getCheckoutRequests") {
        var filtered = requests.filter(function(req) {
          var customerOk = payload.customerId === null || payload.customerId === undefined || req.customerId === payload.customerId;
          var statusOk = payload.status === null || payload.status === undefined || req.status === payload.status;
          return customerOk && statusOk;
        });
        resolve({ ok: true, data: filtered });
        return;
      }

      if (payload.method === "updateCheckoutRequestStatus") {
        requests = requests.map(function(req) {
          if (req.id !== payload.requestId) return req;
          var next = Object.assign({}, req, { status: payload.status });
          if (payload.status === "acknowledged") {
            next.acknowledgedAt = next.acknowledgedAt || new Date().toISOString();
          }
          if (payload.status === "resolved") {
            next.resolvedAt = next.resolvedAt || new Date().toISOString();
          }
          return next;
        });
        window.MOS._writeMockCheckoutRequests(requests);
        resolve({ ok: true, data: null });
        return;
      }

      resolve({
        ok: false,
        error: {
          errorCode: "INVALID_REQUEST",
          message: "Unknown method: " + payload.method,
        },
      });
    }, 180);
  });
};

// ─────────────────────────────────────────
// API送信（fetch / モック切替）
// ─────────────────────────────────────────
window.MOS.apiPost = function(payload) {
  if (window.MOS.API_CONFIG.USE_MOCK) {
    return window.MOS._mockApiPost(payload);
  }

  return window.MOS._postJson(window.MOS.API_CONFIG.ENDPOINT, payload);
};

window.MOS.checkoutApiPost = function(payload) {
  if (window.MOS.API_CONFIG.USE_MOCK) {
    return window.MOS._mockCheckoutApiPost(payload);
  }

  return window.MOS._postJson(window.MOS.API_CONFIG.CHECKOUT_ENDPOINT, payload);
};

window.MOS._postJson = function(endpoint, payload) {
  var controller = new AbortController();
  var timeoutId = setTimeout(function() {
    controller.abort();
  }, window.MOS.API_CONFIG.TIMEOUT_MS);

  return fetch(endpoint, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept":       "application/json",
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
  .then(function(res) {
    if (res.status === 200) {
      return res.text().then(function(text) {
        return { ok: true, data: text ? JSON.parse(text) : null };
      });
    }
    return res.json().then(function(err) {
      return { ok: false, error: err };
    }).catch(function() {
      return {
        ok: false,
        error: {
          errorCode: "SYSTEM_ERROR",
          message: "Unknown error.",
        },
      };
    });
  })
  .catch(function(e) {
    return {
      ok: false,
      error: {
        errorCode: e.name === "AbortError" ? "REQUEST_TIMEOUT" : "SERVICE_UNAVAILABLE",
        message: e.name === "AbortError" ? "Request timed out." : e.message,
      },
    };
  })
  .finally(function() {
    clearTimeout(timeoutId);
  });
};
