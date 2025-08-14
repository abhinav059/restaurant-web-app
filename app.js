/**************
 * QUICK CONFIG
 **************/
const CONFIG = {
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzYiZnOeVskXRGb6TLn-i9LgzU4lVdvd0iMhAWkp9j4FNLGa2FGcheogLmX3C30BnLwsA/exec", // <- change this after step 5
  SHEET_TOKEN: "", // optional shared secret; also set in Apps Script
  CURRENCY: "₹",
};

// --- Local Storage Keys
const LS_KEYS = {
  MENU: "rw_menu_items_v1",
  PIN: "rw_manager_pin_v1",
  ORDERS_PREFIX: "rw_orders_", // + YYYY-MM-DD
};

// --- Utilities
const todayStr = () => new Date().toISOString().slice(0,10);
const fmt = (n) => Number(n || 0).toFixed(2);
const byId = (id) => document.getElementById(id);
const uid = () => crypto.randomUUID();

// Default starter menu
const DEFAULT_MENU = [
  { id: uid(), name: "Masala Dosa", price: 70, image: "https://images.unsplash.com/photo-1589308078059-be1415eab4c3?q=80&w=1200&auto=format&fit=crop" },
  { id: uid(), name: "Idli (2 pcs)", price: 30, image: "https://images.unsplash.com/photo-1604908554049-b3f6aa9c8abf?q=80&w=1200&auto=format&fit=crop" },
  { id: uid(), name: "Chai", price: 10, image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=1200&auto=format&fit=crop" },
];

// --- Menu state
let menu = loadMenu();
function loadMenu() {
  const raw = localStorage.getItem(LS_KEYS.MENU);
  if (!raw) {
    localStorage.setItem(LS_KEYS.MENU, JSON.stringify(DEFAULT_MENU));
    return [...DEFAULT_MENU];
  }
  try { return JSON.parse(raw); } catch { return [...DEFAULT_MENU]; }
}
function saveMenu() {
  localStorage.setItem(LS_KEYS.MENU, JSON.stringify(menu));
  renderAll();
}

// --- Orders (per day)
function loadOrdersFor(dateStr) {
  const raw = localStorage.getItem(LS_KEYS.ORDERS_PREFIX + dateStr);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveOrdersFor(dateStr, orders) {
  localStorage.setItem(LS_KEYS.ORDERS_PREFIX + dateStr, JSON.stringify(orders));
}

// --- Tabs
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    byId("tab-"+btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "sales") refreshSales();
  });
});

// --- My Menu (read-only view)
function renderMenuGrid() {
  const grid = byId("menu-grid");
  grid.innerHTML = "";
  menu.forEach(item => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <img src="${item.image || ""}" alt="${item.name}"/>
      <div class="pad">
        <h4>${item.name}</h4>
        <div class="muted">${CONFIG.CURRENCY}${fmt(item.price)}</div>
      </div>
    `;
    grid.appendChild(el);
  });
}

// --- Order flow
let cart = {}; // itemId -> qty

function renderOrderMenu(filter="") {
  const grid = byId("menu-for-order");
  grid.innerHTML = "";
  const items = filter
    ? menu.filter(m => m.name.toLowerCase().includes(filter.toLowerCase()))
    : menu;
  items.forEach(item => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <img src="${item.image || ""}" alt="${item.name}"/>
      <div class="pad">
        <h4>${item.name}</h4>
        <div class="row space-between">
          <span class="muted">${CONFIG.CURRENCY}${fmt(item.price)}</span>
          <button class="btn small primary">Add</button>
        </div>
      </div>
    `;
    el.querySelector("button").addEventListener("click", () => {
      cart[item.id] = (cart[item.id] || 0) + 1;
      renderCart();
    });
    grid.appendChild(el);
  });
}
byId("search").addEventListener("input", (e)=> renderOrderMenu(e.target.value));

function renderCart() {
  const list = byId("cart-list");
  list.innerHTML = "";
  let subtotal = 0;
  Object.entries(cart).forEach(([id, qty]) => {
    const item = menu.find(m => m.id === id);
    if (!item) return;
    const lineTotal = item.price * qty;
    subtotal += lineTotal;
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div>
        <strong>${item.name}</strong>
        <div class="muted">${CONFIG.CURRENCY}${fmt(item.price)} × ${qty} = ${CONFIG.CURRENCY}${fmt(lineTotal)}</div>
      </div>
      <div class="qty-ctrl">
        <button class="btn small">-</button>
        <input type="number" min="0" step="1" value="${qty}" />
        <button class="btn small">+</button>
        <button class="btn small danger">x</button>
      </div>
    `;
    const [btnMinus, input, btnPlus, btnDel] = row.querySelectorAll("button, input");
    btnMinus.addEventListener("click", ()=>{
      cart[id] = Math.max(0, (cart[id]||0) - 1);
      if (cart[id] === 0) delete cart[id];
      renderCart();
    });
    btnPlus.addEventListener("click", ()=>{
      cart[id] = (cart[id]||0) + 1;
      renderCart();
    });
    btnDel.addEventListener("click", ()=>{
      delete cart[id];
      renderCart();
    });
    input.addEventListener("change", ()=>{
      const v = Math.max(0, parseInt(input.value||"0",10));
      if (v === 0) delete cart[id]; else cart[id] = v;
      renderCart();
    });
    list.appendChild(row);
  });
  byId("subtotal").textContent = fmt(subtotal);
}

byId("clear-cart").addEventListener("click", ()=>{
  cart = {};
  renderCart();
});

byId("submit-order").addEventListener("click", submitOrder);

async function submitOrder() {
  const items = Object.entries(cart).map(([id, qty])=>{
    const m = menu.find(x => x.id === id);
    return { id, name: m?.name || "Item", price: Number(m?.price || 0), qty: Number(qty), lineTotal: Number(qty) * Number(m?.price || 0) };
  }).filter(x => x.qty > 0);
  if (items.length === 0) {
    setStatus("Add items to the cart first.", "warn");
    return;
  }
  const orderId = uid();
  const createdAt = Date.now();
  const subtotal = items.reduce((s,x)=> s + x.lineTotal, 0);
  const order = { orderId, createdAtMillis: createdAt, items, total: subtotal };

  // 1) Save locally (for Daily Sales)
  const dateStr = new Date(createdAt).toISOString().slice(0,10);
  const orders = loadOrdersFor(dateStr);
  orders.push(order);
  saveOrdersFor(dateStr, orders);

  // 2) Send to Google Sheets (Apps Script)
  setStatus("Sending to Google Sheets…", "info");
  try {
    const res = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: CONFIG.SHEET_TOKEN || "",
        orderId,
        createdAtMillis: createdAt,
        total: subtotal,
        items: items.map(i => ({ name: i.name, price: i.price, qty: i.qty, lineTotal: i.lineTotal }))
      })
    });
    const data = await res.json().catch(()=>({ok:false,error:"Bad JSON"}));
    if (res.ok && data.ok) {
      setStatus("✅ Order submitted & synced.", "ok");
      cart = {};
      renderCart();
      if (byId("sales-date").value === dateStr) refreshSales(); // update current day
    } else {
      setStatus("Saved locally. Sync error: " + (data.error || res.statusText), "warn");
    }
  } catch (err) {
    setStatus("Saved locally. Network error—will not auto-resend (manual only).", "warn");
  }
}

function setStatus(msg, kind="info") {
  const el = byId("submit-status");
  el.textContent = msg;
  el.style.color = (kind==="ok") ? "#5dd19f" : (kind==="warn" ? "#ff9c9c" : "#8a93a6");
}

// --- Sales
function refreshSales() {
  const dateFld = byId("sales-date");
  if (!dateFld.value) dateFld.value = todayStr();
  const dateStr = dateFld.value;
  const orders = loadOrdersFor(dateStr);
  const totalsByItem = new Map();
  let grand = 0, totalQty = 0;

  orders.forEach(o=>{
    grand += Number(o.total||0);
    o.items.forEach(it=>{
      totalQty += Number(it.qty||0);
      const cur = totalsByItem.get(it.name) || { qty: 0, sales: 0 };
      cur.qty += Number(it.qty||0);
      cur.sales += Number(it.lineTotal||0);
      totalsByItem.set(it.name, cur);
    });
  });

  byId("sales-total").textContent = fmt(grand);
  byId("sales-qty").textContent = totalQty;

  const tbody = byId("sales-tbody");
  tbody.innerHTML = "";
  [...totalsByItem.entries()]
    .sort((a,b)=> b[1].sales - a[1].sales)
    .forEach(([name, agg])=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${name}</td><td>${agg.qty}</td><td>${fmt(agg.sales)}</td>`;
      tbody.appendChild(tr);
    });
}
byId("sales-date").addEventListener("change", refreshSales);

// Export CSV for selected day
byId("export-csv").addEventListener("click", ()=>{
  const d = byId("sales-date").value || todayStr();
  const orders = loadOrdersFor(d);
  const rows = [["OrderID","Timestamp","Item","Qty","Price","LineTotal","TotalOrder"]];
  orders.forEach(o=>{
    const ts = new Date(o.createdAtMillis).toISOString();
    o.items.forEach(it=>{
      rows.push([o.orderId, ts, it.name, it.qty, it.price, it.lineTotal, o.total]);
    });
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type: "text/csv;charset=utf-8;"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sales_${d}.csv`;
  a.click();
});

// --- Edit Menu (CRUD with optional PIN)
function renderEditTable() {
  const tb = byId("edit-tbody");
  tb.innerHTML = "";
  menu.forEach(it=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img src="${it.image}" alt="" style="width:60px;height:40px;object-fit:cover;border-radius:6px"/></td>
      <td>${it.name}</td>
      <td>${fmt(it.price)}</td>
      <td class="muted" style="font-size:12px">${it.id}</td>
      <td class="row">
        <button class="btn small">Edit</button>
        <button class="btn small danger">Delete</button>
      </td>
    `;
    const [btnEdit, btnDel] = tr.querySelectorAll("button");
    btnEdit.addEventListener("click", ()=> openItemModal(it));
    btnDel.addEventListener("click", ()=> confirmPinThen(()=> {
      menu = menu.filter(m => m.id !== it.id);
      saveMenu();
    }));
    tb.appendChild(tr);
  });
}

byId("add-item-btn").addEventListener("click", ()=> openItemModal(null));

const itemModal = byId("item-modal");
const fldName = byId("modal-name");
const fldPrice = byId("modal-price");
const fldImage = byId("modal-image");
const fldId = byId("modal-id");
const modalTitle = byId("modal-title");

function openItemModal(item) {
  const editing = !!item;
  modalTitle.textContent = editing ? "Edit Item" : "Add Item";
  fldName.value = editing ? item.name : "";
  fldPrice.value = editing ? item.price : "";
  fldImage.value = editing ? item.image : "";
  fldId.value = editing ? item.id : "";
  itemModal.showModal();
}

byId("modal-save").addEventListener("click", (e)=>{
  e.preventDefault();
  const name = fldName.value.trim();
  const price = parseFloat(fldPrice.value);
  const image = fldImage.value.trim();
  if (!name || isNaN(price) || price < 0) return;

  const existingId = fldId.value;
  const performSave = () => {
    if (existingId) {
      // update
      const idx = menu.findIndex(m => m.id === existingId);
      if (idx >= 0) menu[idx] = { ...menu[idx], name, price, image };
    } else {
      // add
      menu.push({ id: uid(), name, price, image });
    }
    saveMenu();
    itemModal.close();
  };

  if (existingId) {
    confirmPinThen(performSave);
  } else {
    performSave();
  }
});

// Manager PIN
const PIN_KEY = LS_KEYS.PIN;
byId("save-pin").addEventListener("click", ()=>{
  const v = byId("manager-pin").value.trim();
  if (v) {
    localStorage.setItem(PIN_KEY, v);
    alert("PIN saved.");
  } else {
    localStorage.removeItem(PIN_KEY);
    alert("PIN cleared.");
  }
});

function confirmPinThen(action) {
  const stored = localStorage.getItem(PIN_KEY);
  if (!stored) { action(); return; }
  const entered = prompt("Enter Manager PIN");
  if (entered === stored) action();
  else alert("Incorrect PIN.");
}

// --- Initial render
function renderAll() {
  renderMenuGrid();
  renderOrderMenu();
  renderCart();
  renderEditTable();
}
renderAll();
