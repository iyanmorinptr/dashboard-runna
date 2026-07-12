/* ============================================================
   Runna Kitchen Dashboard
   Data tersimpan di localStorage browser (kunci: runnaKitchen).
   ============================================================ */

const VARIAN = ['Mentai', 'Truffle', 'Bolognese'];
const PAKET = [6, 8, 14, 20, 25];
const STORAGE_KEY = 'runnaKitchen';
const LOW_STOCK = 25; // pcs — di bawah ini dianggap menipis

const defaultState = () => ({
  stock: { Mentai: 0, Truffle: 0, Bolognese: 0 },
  stockLog: [],   // {id, waktu, varian, delta, ket}
  orders: [],     // {id, nama, tglPesan, tglAmbil, varian, paket, qty, harga, status}
  finance: [],    // {id, tanggal, tipe, kategori, keterangan, jumlah, orderId?}
  harga: { 6: 25000, 8: 33000, 14: 55000, 20: 75000, 25: 90000 },
});

let state = load();
let orderFilter = 'semua';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return Object.assign(defaultState(), JSON.parse(raw));
  } catch {
    return defaultState();
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtRp = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
const fmtTgl = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (iso) => iso.slice(0, 7); // "2026-07"
const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
};
const monthLabelLong = (key) => {
  const [y, m] = key.split('-');
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2600);
}

/* ============================ TABS ============================ */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn);
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab);
    });
  });
});

/* ============================ FINANCE ============================ */
document.getElementById('finance-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  state.finance.push({
    id: uid(),
    tanggal: f.get('tanggal'),
    tipe: f.get('tipe'),
    kategori: f.get('kategori'),
    keterangan: f.get('keterangan') || '-',
    jumlah: Number(f.get('jumlah')),
  });
  save();
  e.target.reset();
  e.target.tanggal.value = todayISO();
  renderAll();
  toast('Transaksi tersimpan');
});

function deleteFinance(id) {
  const trx = state.finance.find((t) => t.id === id);
  if (!trx) return;
  if (trx.orderId) {
    toast('Transaksi otomatis dari orderan — batalkan lewat tab Orderan');
    return;
  }
  if (!confirm('Hapus transaksi ini?')) return;
  state.finance = state.finance.filter((t) => t.id !== id);
  save();
  renderAll();
}

function renderFinanceKpis() {
  const bulanIni = monthKey(todayISO());
  const sum = (arr) => arr.reduce((a, t) => a + t.jumlah, 0);
  const inAll = sum(state.finance.filter((t) => t.tipe === 'pemasukan'));
  const outAll = sum(state.finance.filter((t) => t.tipe === 'pengeluaran'));
  const inMo = sum(state.finance.filter((t) => t.tipe === 'pemasukan' && monthKey(t.tanggal) === bulanIni));
  const outMo = sum(state.finance.filter((t) => t.tipe === 'pengeluaran' && monthKey(t.tanggal) === bulanIni));
  const labaMo = inMo - outMo;

  document.getElementById('finance-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Pemasukan bulan ini</div><div class="kpi-value">${fmtRp(inMo)}</div><div class="kpi-note">total ${fmtRp(inAll)}</div></div>
    <div class="kpi"><div class="kpi-label">Pengeluaran bulan ini</div><div class="kpi-value">${fmtRp(outMo)}</div><div class="kpi-note">total ${fmtRp(outAll)}</div></div>
    <div class="kpi"><div class="kpi-label">Laba bulan ini</div><div class="kpi-value">${fmtRp(labaMo)}</div><div class="kpi-note ${labaMo >= 0 ? 'good' : 'bad'}">${labaMo >= 0 ? '▲ untung' : '▼ rugi'}</div></div>
    <div class="kpi"><div class="kpi-label">Saldo keseluruhan</div><div class="kpi-value">${fmtRp(inAll - outAll)}</div><div class="kpi-note">pemasukan − pengeluaran</div></div>`;
}

function renderFinanceTable() {
  const tbody = document.querySelector('#finance-table tbody');
  const rows = [...state.finance].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Belum ada transaksi</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (t) => `<tr>
        <td>${fmtTgl(t.tanggal)}</td>
        <td><span class="tipe-pill ${t.tipe}">${t.tipe === 'pemasukan' ? 'Masuk' : 'Keluar'}</span></td>
        <td>${t.kategori}${t.orderId ? ' <span class="badge auto">auto</span>' : ''}</td>
        <td>${t.keterangan}</td>
        <td class="num">${t.tipe === 'pengeluaran' ? '−' : ''}${fmtRp(t.jumlah)}</td>
        <td><button class="btn small danger" data-del-trx="${t.id}">Hapus</button></td>
      </tr>`
    )
    .join('');
  tbody.querySelectorAll('[data-del-trx]').forEach((b) =>
    b.addEventListener('click', () => deleteFinance(b.dataset.delTrx))
  );
}

/* ---------- grouped bar chart: pemasukan vs pengeluaran, 6 bulan ---------- */
function renderFinanceChart() {
  const wrap = document.getElementById('finance-chart');
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const data = months.map((mk) => {
    const inM = state.finance.filter((t) => t.tipe === 'pemasukan' && monthKey(t.tanggal) === mk).reduce((a, t) => a + t.jumlah, 0);
    const outM = state.finance.filter((t) => t.tipe === 'pengeluaran' && monthKey(t.tanggal) === mk).reduce((a, t) => a + t.jumlah, 0);
    return { mk, in: inM, out: outM };
  });

  const W = 520, H = 240, padL = 56, padR = 8, padT = 12, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.in, d.out]));
  // sumbu-y "rapi": bulatkan ke atas ke 1/2/5 × 10^n
  const pow = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const yMax = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= maxVal) || maxVal;
  const y = (v) => padT + plotH - (v / yMax) * plotH;

  const groupW = plotW / months.length;
  const barW = Math.min(26, (groupW - 16) / 2);
  const fmtShort = (v) =>
    v >= 1e6 ? (v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt'
    : v >= 1e3 ? (v / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb'
    : String(v);

  let gridSvg = '';
  for (let i = 0; i <= 4; i++) {
    const v = (yMax / 4) * i;
    const yy = y(v);
    gridSvg += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--grid-line)" stroke-width="1"/>
      <text x="${padL - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="var(--text-muted)">${fmtShort(v)}</text>`;
  }

  let barsSvg = '';
  data.forEach((d, i) => {
    const cx = padL + groupW * i + groupW / 2;
    const x1 = cx - barW - 1; // celah 2px antara pasangan bar
    const x2 = cx + 1;
    const r = 4;
    const bar = (x, val, color, label) => {
      const yy = y(val);
      const h = Math.max(padT + plotH - yy, 0);
      const rr = Math.min(r, h); // jangan membulat melebihi tinggi bar
      return `<path d="M${x},${padT + plotH} v${-(h - rr)} q0,${-rr} ${rr},${-rr} h${barW - 2 * rr} q${rr},0 ${rr},${rr} v${h - rr} z"
        fill="${color}" data-tt="${label}|${monthLabelLong(d.mk)}|${val}" class="bar"/>`;
    };
    barsSvg += bar(x1, d.in, 'var(--series-in)', 'Pemasukan');
    barsSvg += bar(x2, d.out, 'var(--series-out)', 'Pengeluaran');
    barsSvg += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${monthLabel(d.mk)}</text>`;
  });

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik pemasukan dan pengeluaran per bulan">
      ${gridSvg}
      <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="var(--baseline)" stroke-width="1"/>
      ${barsSvg}
    </svg>
    <div class="chart-legend">
      <span><span class="swatch" style="background:var(--series-in)"></span>Pemasukan</span>
      <span><span class="swatch" style="background:var(--series-out)"></span>Pengeluaran</span>
    </div>`;

  const tt = document.getElementById('tooltip');
  wrap.querySelectorAll('.bar').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const [label, bulan, val] = el.dataset.tt.split('|');
      tt.innerHTML = `<div class="tt-title">${bulan}</div>
        <div class="tt-row"><span>${label}</span><span class="val">${fmtRp(Number(val))}</span></div>`;
      tt.hidden = false;
      tt.style.left = Math.min(e.clientX + 12, window.innerWidth - 220) + 'px';
      tt.style.top = e.clientY + 12 + 'px';
    });
    el.addEventListener('mouseleave', () => (tt.hidden = true));
  });
}

/* ---------- laporan penjualan ---------- */
function renderSalesReport() {
  const sel = document.getElementById('report-month');
  const done = state.orders.filter((o) => o.status === 'Selesai');
  const monthsWithSales = [...new Set(done.map((o) => monthKey(o.tglAmbil)))].sort().reverse();
  const current = monthKey(todayISO());
  if (!monthsWithSales.includes(current)) monthsWithSales.unshift(current);

  const chosen = sel.dataset.chosen && monthsWithSales.includes(sel.dataset.chosen) ? sel.dataset.chosen : current;
  sel.innerHTML = monthsWithSales.map((m) => `<option value="${m}" ${m === chosen ? 'selected' : ''}>${monthLabelLong(m)}</option>`).join('');
  sel.onchange = () => { sel.dataset.chosen = sel.value; renderSalesReport(); };

  const rows = done.filter((o) => monthKey(o.tglAmbil) === chosen);
  const box = document.getElementById('sales-report');
  if (!rows.length) {
    box.innerHTML = `<p style="color:var(--text-muted);margin:8px 0;">Belum ada penjualan selesai di ${monthLabelLong(chosen)}.</p>`;
    return;
  }

  const totalOrder = rows.length;
  const totalPcs = rows.reduce((a, o) => a + o.paket * o.qty, 0);
  const totalRp = rows.reduce((a, o) => a + o.harga, 0);

  const perVarian = VARIAN.map((v) => {
    const r = rows.filter((o) => o.varian === v);
    return { v, order: r.length, pcs: r.reduce((a, o) => a + o.paket * o.qty, 0), rp: r.reduce((a, o) => a + o.harga, 0) };
  });
  const perPaket = PAKET.map((p) => {
    const r = rows.filter((o) => o.paket === p);
    return { p, qty: r.reduce((a, o) => a + o.qty, 0), rp: r.reduce((a, o) => a + o.harga, 0) };
  });

  box.innerHTML = `
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">Order selesai</div><div class="kpi-value">${totalOrder}</div></div>
      <div class="kpi"><div class="kpi-label">Total pcs terjual</div><div class="kpi-value">${totalPcs}</div></div>
      <div class="kpi"><div class="kpi-label">Omzet penjualan</div><div class="kpi-value">${fmtRp(totalRp)}</div></div>
    </div>
    <div class="grid-2">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Varian</th><th class="num">Order</th><th class="num">Pcs</th><th class="num">Omzet</th></tr></thead>
          <tbody>${perVarian.map((r) => `<tr><td>${r.v}</td><td class="num">${r.order}</td><td class="num">${r.pcs}</td><td class="num">${fmtRp(r.rp)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Paket</th><th class="num">Terjual</th><th class="num">Omzet</th></tr></thead>
          <tbody>${perPaket.map((r) => `<tr><td>${r.p} pcs</td><td class="num">${r.qty}×</td><td class="num">${fmtRp(r.rp)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

/* ============================ STOCK ============================ */
document.getElementById('stock-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const varian = f.get('varian');
  const jumlah = Number(f.get('jumlah'));
  const delta = f.get('aksi') === 'tambah' ? jumlah : -jumlah;
  if (state.stock[varian] + delta < 0) {
    toast(`Stok ${varian} hanya ${state.stock[varian]} pcs — tidak bisa dikurangi ${jumlah}`);
    return;
  }
  state.stock[varian] += delta;
  state.stockLog.unshift({
    id: uid(),
    waktu: new Date().toISOString(),
    varian,
    delta,
    ket: f.get('keterangan') || (delta > 0 ? 'Penambahan stok' : 'Pengurangan stok'),
  });
  save();
  e.target.reset();
  renderAll();
  toast(`Stok ${varian} ${delta > 0 ? '+' : ''}${delta} pcs`);
});

function renderStock() {
  const cards = document.getElementById('stock-cards');
  cards.innerHTML = VARIAN.map((v) => {
    const qty = state.stock[v];
    const cap = Math.max(100, qty); // skala meter
    const pct = Math.min(100, (qty / cap) * 100);
    const status =
      qty === 0
        ? '<span class="stock-status out">⛔ Habis</span>'
        : qty < LOW_STOCK
        ? '<span class="stock-status warn">⚠️ Stok menipis</span>'
        : '<span class="stock-status ok">✔ Aman</span>';
    return `<div class="stock-card">
      <h3>Dimsum ${v}</h3>
      <div class="stock-qty">${qty} <small>pcs</small></div>
      <div class="meter"><span style="width:${pct}%"></span></div>
      ${status}
    </div>`;
  }).join('');

  const tbody = document.querySelector('#stock-log-table tbody');
  const rows = state.stockLog.slice(0, 30);
  tbody.innerHTML = rows.length
    ? rows
        .map(
          (l) => `<tr>
            <td>${new Date(l.waktu).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td>${l.varian}</td>
            <td class="num"><span class="tipe-pill ${l.delta > 0 ? 'pemasukan' : 'pengeluaran'}">${l.delta > 0 ? '+' : ''}${l.delta} pcs</span></td>
            <td>${l.ket}</td>
          </tr>`
        )
        .join('')
    : '<tr class="empty-row"><td colspan="4">Belum ada pergerakan stok</td></tr>';
}

/* ============================ ORDERS ============================ */
const orderForm = document.getElementById('order-form');

function syncHargaField() {
  const paket = orderForm.paket.value;
  const qty = Number(orderForm.qty.value) || 1;
  orderForm.harga.value = (state.harga[paket] || 0) * qty;
}
orderForm.paket.addEventListener('change', syncHargaField);
orderForm.qty.addEventListener('input', syncHargaField);

orderForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(orderForm);
  state.orders.unshift({
    id: uid(),
    nama: f.get('nama').trim(),
    tglPesan: f.get('tglPesan'),
    tglAmbil: f.get('tglAmbil'),
    varian: f.get('varian'),
    paket: Number(f.get('paket')),
    qty: Number(f.get('qty')),
    harga: Number(f.get('harga')),
    status: 'Baru',
  });
  save();
  orderForm.reset();
  orderForm.tglPesan.value = todayISO();
  orderForm.qty.value = 1;
  syncHargaField();
  renderAll();
  toast('Orderan ditambahkan');
});

function completeOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o || o.status !== 'Baru') return;
  const pcs = o.paket * o.qty;
  if (state.stock[o.varian] < pcs) {
    toast(`Stok ${o.varian} kurang (${state.stock[o.varian]} pcs, butuh ${pcs}). Tambah stok dulu di tab Stock.`);
    return;
  }
  o.status = 'Selesai';
  state.stock[o.varian] -= pcs;
  state.stockLog.unshift({
    id: uid(),
    waktu: new Date().toISOString(),
    varian: o.varian,
    delta: -pcs,
    ket: `Order selesai — ${o.nama} (${o.paket} pcs × ${o.qty})`,
  });
  state.finance.push({
    id: uid(),
    tanggal: todayISO(),
    tipe: 'pemasukan',
    kategori: 'Penjualan',
    keterangan: `Order ${o.nama} — ${o.varian} ${o.paket} pcs × ${o.qty}`,
    jumlah: o.harga,
    orderId: o.id,
  });
  save();
  renderAll();
  toast(`Order ${o.nama} selesai — stok ${o.varian} −${pcs} pcs, pemasukan ${fmtRp(o.harga)}`);
}

function undoOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o || o.status !== 'Selesai') return;
  if (!confirm('Kembalikan order ini ke status Baru? Stok dan pemasukan otomatis akan dikembalikan.')) return;
  const pcs = o.paket * o.qty;
  o.status = 'Baru';
  state.stock[o.varian] += pcs;
  state.stockLog.unshift({
    id: uid(),
    waktu: new Date().toISOString(),
    varian: o.varian,
    delta: pcs,
    ket: `Pembatalan penyelesaian order — ${o.nama}`,
  });
  state.finance = state.finance.filter((t) => t.orderId !== o.id);
  save();
  renderAll();
  toast('Order dikembalikan ke status Baru');
}

function cancelOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o || o.status !== 'Baru') return;
  o.status = 'Batal';
  save();
  renderAll();
}

function deleteOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return;
  if (o.status === 'Selesai') {
    toast('Order selesai tidak bisa dihapus — batalkan penyelesaiannya dulu');
    return;
  }
  if (!confirm(`Hapus orderan ${o.nama}?`)) return;
  state.orders = state.orders.filter((x) => x.id !== id);
  save();
  renderAll();
}

document.querySelectorAll('#order-filter .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    orderFilter = chip.dataset.status;
    document.querySelectorAll('#order-filter .chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderOrders();
  });
});

function renderOrderKpis() {
  const baru = state.orders.filter((o) => o.status === 'Baru');
  const hariIni = state.orders.filter((o) => o.status === 'Baru' && o.tglAmbil === todayISO());
  const pcsDibutuhkan = baru.reduce((a, o) => a + o.paket * o.qty, 0);
  const totalStok = VARIAN.reduce((a, v) => a + state.stock[v], 0);
  document.getElementById('order-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Order aktif</div><div class="kpi-value">${baru.length}</div></div>
    <div class="kpi"><div class="kpi-label">Diambil hari ini</div><div class="kpi-value">${hariIni.length}</div></div>
    <div class="kpi"><div class="kpi-label">Pcs dibutuhkan (order aktif)</div><div class="kpi-value">${pcsDibutuhkan}</div>
      <div class="kpi-note ${pcsDibutuhkan > totalStok ? 'bad' : 'good'}">stok total ${totalStok} pcs ${pcsDibutuhkan > totalStok ? '— kurang!' : '— cukup'}</div></div>`;
}

function renderOrders() {
  const tbody = document.querySelector('#order-table tbody');
  let rows = [...state.orders];
  if (orderFilter !== 'semua') rows = rows.filter((o) => o.status === orderFilter);
  rows.sort((a, b) => (a.status === 'Baru') === (b.status === 'Baru') ? a.tglAmbil.localeCompare(b.tglAmbil) : a.status === 'Baru' ? -1 : 1);

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Belum ada orderan</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((o) => {
      const pcs = o.paket * o.qty;
      const aksi =
        o.status === 'Baru'
          ? `<button class="btn small primary" data-done="${o.id}">✔ Selesai</button>
             <button class="btn small" data-cancel="${o.id}">Batal</button>
             <button class="btn small danger" data-del="${o.id}">Hapus</button>`
          : o.status === 'Selesai'
          ? `<button class="btn small" data-undo="${o.id}">↩ Batalkan selesai</button>`
          : `<button class="btn small danger" data-del="${o.id}">Hapus</button>`;
      return `<tr>
        <td><strong>${o.nama}</strong></td>
        <td>${fmtTgl(o.tglPesan)}</td>
        <td>${fmtTgl(o.tglAmbil)}</td>
        <td>Dimsum ${o.varian} — paket ${o.paket} pcs × ${o.qty}</td>
        <td class="num">${pcs}</td>
        <td class="num">${fmtRp(o.harga)}</td>
        <td><span class="badge ${o.status.toLowerCase()}">${o.status}</span></td>
        <td style="white-space:nowrap">${aksi}</td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => completeOrder(b.dataset.done)));
  tbody.querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', () => undoOrder(b.dataset.undo)));
  tbody.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => cancelOrder(b.dataset.cancel)));
  tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteOrder(b.dataset.del)));
}

/* ---------- harga default paket ---------- */
function renderPriceForm() {
  const form = document.getElementById('price-form');
  form.innerHTML =
    PAKET.map(
      (p) => `<label>Paket ${p} pcs
        <input type="number" min="0" step="500" name="p${p}" value="${state.harga[p]}"></label>`
    ).join('') + '<label>&nbsp;<button type="submit" class="btn primary">Simpan Harga</button></label>';
  form.onsubmit = (e) => {
    e.preventDefault();
    PAKET.forEach((p) => (state.harga[p] = Number(form[`p${p}`].value) || 0));
    save();
    syncHargaField();
    toast('Harga default tersimpan');
  };
}

/* ============================ INIT ============================ */
function renderAll() {
  renderFinanceKpis();
  renderFinanceChart();
  renderFinanceTable();
  renderSalesReport();
  renderStock();
  renderOrderKpis();
  renderOrders();
}

document.querySelector('#finance-form [name=tanggal]').value = todayISO();
orderForm.tglPesan.value = todayISO();
syncHargaField();
renderPriceForm();
renderAll();
