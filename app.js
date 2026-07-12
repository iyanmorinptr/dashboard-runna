/* ============================================================
   Runna Kitchen Dashboard
   Data tersimpan di localStorage browser (kunci: runnaKitchen).
   ============================================================ */

const VARIAN = ['Mentai', 'Truffle', 'Bolognese'];
const PAKET = [6, 8, 14, 20, 25];
const STORAGE_KEY = 'runnaKitchen';
const LOW_STOCK = 25; // pcs — di bawah ini dianggap menipis

const defaultState = () => ({
  stock: 0,       // total stok dimsum (pcs), tidak dipisah per varian saus
  stockLog: [],   // {id, waktu, delta, ket}
  orders: [],     // {id, nama, tglPesan, tglAmbil, varian, paket, qty, harga, status}
  finance: [],    // {id, tanggal, tipe, kategori, keterangan, jumlah, orderId?}
  harga: { 6: 25000, 8: 33000, 14: 55000, 20: 75000, 25: 90000 },
});

// data lama menyimpan stok per varian ({Mentai: n, ...}) — jumlahkan jadi satu angka
function normalizeState(s) {
  if (s.stock && typeof s.stock === 'object') {
    s.stock = Object.values(s.stock).reduce((a, n) => a + (Number(n) || 0), 0);
  }
  return s;
}

let state = load();
let orderFilter = 'semua';

/* ---------- sinkronisasi cloud (opsional, lihat config.js) ---------- */
const cloudConfigured =
  typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY;
let db = null;
if (cloudConfigured) {
  if (!window.supabase) {
    showFatalBanner('File supabase.min.js gagal dimuat — sinkronisasi mati. Pastikan file itu ada di repo.');
  } else {
    try {
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      showFatalBanner('Konfigurasi Supabase tidak valid: ' + e.message);
    }
  }
}
const cloudEnabled = !!db;
let cloudReady = false;

function showFatalBanner(msg) {
  const div = document.createElement('div');
  div.style.cssText =
    'background:#d03b3b;color:#fff;padding:10px 16px;font-size:13px;font-weight:600;text-align:center;';
  div.textContent = 'Perhatian: ' + msg;
  document.body.prepend(div);
}

function setCloudBadge(ok) {
  const el = document.getElementById('cloud-badge');
  el.hidden = false;
  el.className = 'cloud-badge ' + (ok ? 'ok' : 'err');
  el.querySelector('.cb-text').textContent = ok ? 'Tersinkron' : 'Gagal sinkron';
}

async function pullCloud() {
  const { data, error } = await db.from('app_state').select('data').eq('id', 1).maybeSingle();
  if (error) {
    setCloudBadge(false);
    toast('Gagal mengambil data dari cloud — coba muat ulang halaman');
    return;
  }
  if (data && data.data) {
    state = normalizeState(Object.assign(defaultState(), data.data));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    // belum ada data di cloud: unggah data perangkat ini sebagai awal
    await db.from('app_state').upsert({ id: 1, data: state });
  }
  setCloudBadge(true);
}

let pushTimer;
function pushCloud() {
  if (!cloudReady) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const { error } = await db
      .from('app_state')
      .upsert({ id: 1, data: state, updated_at: new Date().toISOString() });
    setCloudBadge(!error);
    if (error) toast('Gagal sinkron ke cloud — data tetap tersimpan di perangkat ini');
  }, 400);
}

async function afterLogin() {
  document.getElementById('login-overlay').hidden = true;
  document.getElementById('logout-btn').hidden = false;
  showWelcome();
  await pullCloud();
  cloudReady = true;
  renderPriceForm();
  syncHargaField();
  renderAll();
}

async function initCloud() {
  const { data } = await db.auth.getSession();
  if (data && data.session) {
    afterLogin();
  } else {
    document.getElementById('login-overlay').hidden = false;
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const errEl = document.getElementById('login-error');
  errEl.hidden = true;
  const { error } = await db.auth.signInWithPassword({
    email: f.get('email'),
    password: f.get('password'),
  });
  if (error) {
    errEl.textContent = 'Email atau kata sandi salah';
    errEl.hidden = false;
    return;
  }
  afterLogin();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  if (!confirm('Keluar dari dashboard?')) return;
  await db.auth.signOut();
  location.reload();
});

// saat kembali ke tab/aplikasi, ambil data terbaru dari cloud
window.addEventListener('focus', async () => {
  if (cloudReady) {
    await pullCloud();
    renderAll();
  }
});

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return normalizeState(Object.assign(defaultState(), JSON.parse(raw)));
  } catch {
    return defaultState();
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  pushCloud();
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

/* ============================ MENU (drawer) ============================ */
const drawer = document.getElementById('drawer');
const backdrop = document.getElementById('drawer-backdrop');

function setDrawer(open) {
  drawer.classList.toggle('open', open);
  backdrop.hidden = !open;
}
document.getElementById('menu-btn').addEventListener('click', () => setDrawer(true));
backdrop.addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setDrawer(false);
});

document.querySelectorAll('.drawer-item[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.drawer-item[data-tab]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab);
    });
    setDrawer(false);
    window.scrollTo({ top: 0 });
  });
});

/* ---------- animasi sambutan setelah login ---------- */
function showWelcome() {
  const el = document.getElementById('welcome');
  el.hidden = false;
  el.classList.remove('fade-out');
  setTimeout(() => el.classList.add('fade-out'), 1900);
  setTimeout(() => { el.hidden = true; }, 2500);
}

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
    toast('Transaksi otomatis dari order — batalkan/hapus ordernya lewat tab Order');
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
  const jumlah = Number(f.get('jumlah'));
  const delta = f.get('aksi') === 'tambah' ? jumlah : -jumlah;
  if (state.stock + delta < 0) {
    toast(`Stok dimsum hanya ${state.stock} pcs — tidak bisa dikurangi ${jumlah}`);
    return;
  }
  state.stock += delta;
  state.stockLog.unshift({
    id: uid(),
    waktu: new Date().toISOString(),
    delta,
    ket: f.get('keterangan') || (delta > 0 ? 'Penambahan stok' : 'Pengurangan stok'),
  });
  save();
  e.target.reset();
  renderAll();
  toast(`Stok dimsum ${delta > 0 ? '+' : ''}${delta} pcs`);
});

function renderStock() {
  const cards = document.getElementById('stock-cards');
  const qty = state.stock;
  const cap = Math.max(100, qty); // skala meter
  const pct = Math.min(100, (qty / cap) * 100);
  const status =
    qty === 0
      ? '<span class="stock-status out"><span class="sdot"></span>Habis</span>'
      : qty < LOW_STOCK
      ? '<span class="stock-status warn"><span class="sdot"></span>Stok menipis</span>'
      : '<span class="stock-status ok"><span class="sdot"></span>Aman</span>';
  cards.innerHTML = `<div class="stock-card">
    <h3>Stok Dimsum</h3>
    <div class="stock-qty">${qty} <small>pcs</small></div>
    <div class="meter"><span style="width:${pct}%"></span></div>
    ${status}
  </div>`;

  const tbody = document.querySelector('#stock-log-table tbody');
  const rows = state.stockLog.slice(0, 30);
  tbody.innerHTML = rows.length
    ? rows
        .map(
          (l) => `<tr>
            <td>${new Date(l.waktu).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td class="num"><span class="tipe-pill ${l.delta > 0 ? 'pemasukan' : 'pengeluaran'}">${l.delta > 0 ? '+' : ''}${l.delta} pcs</span></td>
            <td>${l.ket}</td>
          </tr>`
        )
        .join('')
    : '<tr class="empty-row"><td colspan="3">Belum ada pergerakan stok</td></tr>';
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
  const order = {
    id: uid(),
    nama: f.get('nama').trim(),
    wa: (f.get('wa') || '').trim(),
    tglPesan: f.get('tglPesan'),
    tglAmbil: f.get('tglAmbil'),
    varian: f.get('varian'),
    paket: Number(f.get('paket')),
    qty: Number(f.get('qty')),
    harga: Number(f.get('harga')),
    status: 'Baru',
  };
  // stok dimsum langsung terpotong begitu order masuk
  const pcs = order.paket * order.qty;
  if (state.stock < pcs) {
    toast(`Stok dimsum kurang (${state.stock} pcs, butuh ${pcs}). Tambah stok dulu di tab Stock.`);
    return;
  }
  state.stock -= pcs;
  state.stockLog.unshift({
    id: uid(),
    waktu: new Date().toISOString(),
    delta: -pcs,
    ket: `Order masuk — ${order.nama} (${order.paket} pcs × ${order.qty})`,
  });
  state.orders.unshift(order);
  save();
  orderForm.reset();
  orderForm.tglPesan.value = todayISO();
  orderForm.qty.value = 1;
  syncHargaField();
  renderAll();
  toast(`Order ditambahkan — stok dimsum −${pcs} pcs`);
});

function completeOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o || o.status !== 'Baru') return;
  o.status = 'Selesai';
  // stok sudah terpotong saat order masuk; di sini tinggal catat pemasukan
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
  toast(`Order ${o.nama} selesai — pemasukan ${fmtRp(o.harga)} masuk Finance`);
}

function undoOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o || o.status !== 'Selesai') return;
  if (!confirm('Kembalikan order ini ke status Baru? Pemasukan otomatis di Finance akan dihapus.')) return;
  o.status = 'Baru';
  state.finance = state.finance.filter((t) => t.orderId !== o.id);
  save();
  renderAll();
  toast('Order dikembalikan ke status Baru');
}

// stok yang terpotong saat order masuk dikembalikan lagi
function restoreStockFor(o, alasan) {
  const pcs = o.paket * o.qty;
  state.stock += pcs;
  state.stockLog.unshift({
    id: uid(),
    waktu: new Date().toISOString(),
    delta: pcs,
    ket: `${alasan} — ${o.nama} (${o.paket} pcs × ${o.qty})`,
  });
}

function cancelOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o || o.status !== 'Baru') return;
  o.status = 'Batal';
  restoreStockFor(o, 'Order dibatalkan');
  save();
  renderAll();
  toast(`Order dibatalkan — stok dimsum +${o.paket * o.qty} pcs`);
}

function deleteOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return;
  if (o.status === 'Selesai') {
    toast('Order selesai tidak bisa dihapus — batalkan penyelesaiannya dulu');
    return;
  }
  if (!confirm(`Hapus order ${o.nama}?`)) return;
  if (o.status === 'Baru') restoreStockFor(o, 'Order dihapus'); // order Batal sudah dikembalikan saat dibatalkan
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
  const totalStok = state.stock;
  document.getElementById('order-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Order aktif</div><div class="kpi-value">${baru.length}</div></div>
    <div class="kpi"><div class="kpi-label">Diambil hari ini</div><div class="kpi-value">${hariIni.length}</div></div>
    <div class="kpi"><div class="kpi-label">Pcs dipesan (order aktif)</div><div class="kpi-value">${pcsDibutuhkan}</div>
      <div class="kpi-note">sisa stok dimsum ${totalStok} pcs</div></div>`;
}

function renderOrders() {
  const tbody = document.querySelector('#order-table tbody');
  let rows = [...state.orders];
  if (orderFilter !== 'semua') rows = rows.filter((o) => o.status === orderFilter);
  rows.sort((a, b) => (a.status === 'Baru') === (b.status === 'Baru') ? a.tglAmbil.localeCompare(b.tglAmbil) : a.status === 'Baru' ? -1 : 1);

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Belum ada order</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((o) => {
      const pcs = o.paket * o.qty;
      const billBtn = `<button class="btn small" data-bill="${o.id}">Bill</button>`;
      const aksi =
        o.status === 'Baru'
          ? `<button class="btn small primary" data-done="${o.id}">Selesai</button>
             ${billBtn}
             <button class="btn small" data-cancel="${o.id}">Batal</button>
             <button class="btn small danger" data-del="${o.id}">Hapus</button>`
          : o.status === 'Selesai'
          ? `${billBtn}
             <button class="btn small" data-undo="${o.id}">Batalkan selesai</button>`
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

  tbody.querySelectorAll('[data-bill]').forEach((b) => b.addEventListener('click', () => sendBill(b.dataset.bill)));
  tbody.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => completeOrder(b.dataset.done)));
  tbody.querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', () => undoOrder(b.dataset.undo)));
  tbody.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => cancelOrder(b.dataset.cancel)));
  tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteOrder(b.dataset.del)));
}

/* ============================ BILL (PDF) ============================ */
let logoImgPromise;
function loadLogo() {
  if (!logoImgPromise) {
    logoImgPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // konversi ke data-URI JPEG: jsPDF meng-embed JPEG apa adanya,
        // sedangkan elemen <img> di-embed sebagai bitmap mentah (PDF bengkak)
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        resolve({ data: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height });
      };
      img.onerror = () => resolve(null); // logo gagal dimuat: bill tetap dibuat tanpa logo
      img.src = 'mipo-logo.png';
    });
  }
  return logoImgPromise;
}

// nomor lokal (08xx) → format internasional wa.me (628xx)
function waNumber(raw) {
  let n = (raw || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  return n;
}

async function buildBillPdf(o) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a5' }); // 148 × 210 mm
  const W = 148;
  const brand = '#a2502c';
  const pcs = o.paket * o.qty;
  const noBill = 'RK-' + o.id.toUpperCase();

  // header terakota
  doc.setFillColor(brand);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('RUNNA. KITCHEN', 10, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Dimsum — Mentai · Truffle · Bolognese', 10, 19);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL', W - 10, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(noBill, W - 10, 19, { align: 'right' });

  // info pemesan
  doc.setTextColor('#1c1310');
  doc.setFontSize(10);
  let y = 38;
  const row = (label, val) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#8f8279');
    doc.text(label, 10, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#1c1310');
    doc.text(String(val), 48, y);
    y += 7;
  };
  row('Nama', o.nama);
  row('Tgl Pesanan', fmtTgl(o.tglPesan));
  row('Tgl Pengambilan', fmtTgl(o.tglAmbil));
  row('Status', o.status);

  // tabel item
  y += 4;
  doc.setFillColor('#f3e3da');
  doc.rect(10, y - 5, W - 20, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Item', 12, y);
  doc.text('Qty', 92, y, { align: 'right' });
  doc.text('Subtotal', W - 12, y, { align: 'right' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Dimsum ${o.varian} — paket ${o.paket} pcs`, 12, y);
  doc.text(`${o.qty}×`, 92, y, { align: 'right' });
  doc.text(fmtRp(o.harga).replace(/\u00A0/g, ' '), W - 12, y, { align: 'right' });
  y += 4;
  doc.setDrawColor('#cbbdb2');
  doc.line(10, y, W - 10, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total (${pcs} pcs)`, 12, y);
  doc.text(fmtRp(o.harga).replace(/\u00A0/g, ' '), W - 12, y, { align: 'right' });

  // footer: terima kasih + powered by MIPO Group
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#8f8279');
  doc.text('Terima kasih sudah memesan di Runna Kitchen!', W / 2, 178, { align: 'center' });
  const logo = await loadLogo();
  doc.setFontSize(7);
  doc.text('powered by', W / 2, 188, { align: 'center' });
  if (logo) {
    const lw = 24, lh = lw * (logo.h / logo.w);
    doc.addImage(logo.data, 'JPEG', (W - lw) / 2, 191, lw, lh);
  } else {
    doc.setFontSize(9);
    doc.text('MIPO GROUP', W / 2, 195, { align: 'center' });
  }
  return { doc, noBill };
}

async function sendBill(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return;
  if (!window.jspdf) {
    toast('File jspdf.umd.min.js gagal dimuat — fitur bill tidak tersedia');
    return;
  }
  const { doc, noBill } = await buildBillPdf(o);
  const fileName = `Bill ${o.nama} ${noBill}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });

  // di HP: buka menu share supaya bisa langsung kirim PDF ke WhatsApp
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // pengguna menutup menu share
    }
  }

  // fallback (laptop/desktop): unduh PDF lalu buka chat WA customer
  doc.save(fileName);
  const wa = waNumber(o.wa);
  if (wa) {
    const msg = `Halo ${o.nama}, berikut bill pesanan dimsum Anda (${noBill}). Total ${fmtRp(o.harga)}. PDF bill terlampir. Terima kasih! — Runna Kitchen`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
    toast('Bill diunduh — lampirkan PDF-nya di chat WA yang terbuka');
  } else {
    toast('Bill PDF diunduh. Isi No. WA customer di order agar chat WA terbuka otomatis.');
  }
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
if (cloudEnabled) initCloud();
