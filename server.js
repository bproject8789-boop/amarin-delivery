const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Data files ──
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
[DATA_DIR, UPLOAD_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

function readJSON(file, def) {
  const fp = path.join(DATA_DIR, file);
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch(e) { return def; }
}
function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// ── Seed default data ──
function seedDefaults() {
  if (!fs.existsSync(path.join(DATA_DIR, 'menu.json'))) {
    writeJSON('menu.json', [
      { id:1, name:'เนื้อตุ๋นโคตรนุ่ม',         cat:'เนื้อ', price:159, img:'🥩', desc:'เนื้อตุ๋นเปื่อย หอมเครื่องเทศ',  stock:999, status:'เปิด', signature:true,  sortOrder:1 },
      { id:2, name:'เนื้อทอดกระเทียมโคตรกรอบ', cat:'เนื้อ', price:139, img:'🍖', desc:'ทอดกรอบ กระเทียมหอม',            stock:999, status:'เปิด', signature:true,  sortOrder:2 },
      { id:3, name:'สเต็กเนื้อโคตรกรอบ',        cat:'เนื้อ', price:199, img:'🥩', desc:'สันใน ย่างกรอบ เสิร์ฟกับสลัด',  stock:999, status:'เปิด', signature:true,  sortOrder:3 },
      { id:4, name:'หมูทอดกระเทียม',            cat:'หมู',  price:89,  img:'🐷', desc:'หมูทอดกรอบ กระเทียมหอม',        stock:999, status:'เปิด', signature:false, sortOrder:4 },
      { id:5, name:'หมูย่างซีอิ๊ว',             cat:'หมู',  price:99,  img:'🐷', desc:'หมูย่างหวานหอม',                 stock:999, status:'เปิด', signature:false, sortOrder:5 },
    ]);
  }
  if (!fs.existsSync(path.join(DATA_DIR, 'promos.json')))   writeJSON('promos.json', []);
  if (!fs.existsSync(path.join(DATA_DIR, 'orders.json')))   writeJSON('orders.json', []);
  if (!fs.existsSync(path.join(DATA_DIR, 'customers.json'))) writeJSON('customers.json', []);
  if (!fs.existsSync(path.join(DATA_DIR, 'config.json'))) {
    writeJSON('config.json', {
      shopName: 'อมรินทร์ โคตรเนื้อ โคตรกรอบ',
      shopLat: 17.4138, shopLng: 102.8236,
      radiusKm: 3,
      deliveryFee: 15,
      grabUrl: 'https://www.grab.com',
      linemanUrl: 'https://lin.ee/your-lineman',
      lineToken: '',
      adminLineIds: [],
      shopOpen: 10, shopClose: 21,
    });
  }
}
seedDefaults();

// ─────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────
app.get('/config', (req, res) => {
  res.json({ ok: true, ...readJSON('config.json', {}) });
});

app.put('/config', (req, res) => {
  const cur = readJSON('config.json', {});
  writeJSON('config.json', { ...cur, ...req.body });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────
// MENU
// ─────────────────────────────────────────────────
app.get('/menu', (req, res) => {
  const menu = readJSON('menu.json', [])
    .filter(m => m.status !== 'ปิด')
    .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
  res.json({ ok: true, menu });
});

app.get('/menu/all', (req, res) => {
  res.json({ ok: true, menu: readJSON('menu.json', []).sort((a,b) => (a.sortOrder||99)-(b.sortOrder||99)) });
});

// เพิ่ม/แก้ไขเมนู
app.post('/menu', (req, res) => {
  const menu = readJSON('menu.json', []);
  const item = req.body;
  if (!item.name || !item.price) return res.json({ ok: false, error: 'name and price required' });
  item.id = item.id || Date.now() % 100000;
  item.status = item.status || 'เปิด';
  item.stock = item.stock || 999;
  const idx = menu.findIndex(m => m.id === item.id);
  if (idx >= 0) menu[idx] = { ...menu[idx], ...item };
  else menu.push(item);
  writeJSON('menu.json', menu);
  res.json({ ok: true, item });
});

// ลบเมนู
app.delete('/menu/:id', (req, res) => {
  const menu = readJSON('menu.json', []);
  const id = parseInt(req.params.id);
  writeJSON('menu.json', menu.filter(m => m.id !== id));
  res.json({ ok: true });
});

// เปิด/ปิดเมนู
app.patch('/menu/:id/status', (req, res) => {
  const menu = readJSON('menu.json', []);
  const id = parseInt(req.params.id);
  const idx = menu.findIndex(m => m.id === id);
  if (idx < 0) return res.json({ ok: false, error: 'not found' });
  menu[idx].status = req.body.status;
  writeJSON('menu.json', menu);
  res.json({ ok: true });
});

// อัปโหลดรูปเมนู (base64)
app.post('/menu/upload-image', (req, res) => {
  const { id, imageBase64 } = req.body;
  if (!imageBase64) return res.json({ ok: false, error: 'no image' });
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const filename = 'menu_' + id + '_' + Date.now() + '.jpg';
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
  const imageUrl = '/uploads/' + filename;
  // อัปเดต img ใน menu.json
  const menu = readJSON('menu.json', []);
  const idx = menu.findIndex(m => m.id == id);
  if (idx >= 0) { menu[idx].img = imageUrl; writeJSON('menu.json', menu); }
  res.json({ ok: true, imageUrl });
});

// ─────────────────────────────────────────────────
// PROMOTIONS
// ─────────────────────────────────────────────────
app.get('/promos', (req, res) => {
  const now = new Date();
  const promos = readJSON('promos.json', []).filter(p => {
    if (p.status === 'ปิด') return false;
    if (p.validFrom && new Date(p.validFrom) > now) return false;
    if (p.validTo && new Date(p.validTo) < now) return false;
    return true;
  });
  res.json({ ok: true, promos });
});

app.get('/promos/all', (req, res) => {
  res.json({ ok: true, promos: readJSON('promos.json', []) });
});

app.post('/promos', (req, res) => {
  const promos = readJSON('promos.json', []);
  const p = { ...req.body, id: req.body.id || ('P' + Date.now().toString().slice(-4)), status: 'เปิด' };
  if (!p.name) return res.json({ ok: false, error: 'name required' });
  const idx = promos.findIndex(x => x.id === p.id);
  if (idx >= 0) promos[idx] = p; else promos.push(p);
  writeJSON('promos.json', promos);
  res.json({ ok: true, promo: p });
});

app.delete('/promos/:id', (req, res) => {
  const promos = readJSON('promos.json', []);
  writeJSON('promos.json', promos.filter(p => p.id !== req.params.id));
  res.json({ ok: true });
});

app.patch('/promos/:id/status', (req, res) => {
  const promos = readJSON('promos.json', []);
  const idx = promos.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.json({ ok: false, error: 'not found' });
  promos[idx].status = req.body.status;
  writeJSON('promos.json', promos);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────
app.post('/orders', (req, res) => {
  const orders = readJSON('orders.json', []);
  const order = {
    ...req.body,
    orderId: req.body.orderId || ('ORD' + Date.now().toString().slice(-8)),
    status: 'รอยืนยัน',
    createdAt: new Date().toISOString(),
  };
  orders.unshift(order);
  writeJSON('orders.json', orders);
  // อัปเดต customer
  upsertCustomer(order);
  res.json({ ok: true, orderId: order.orderId });
});

app.get('/orders', (req, res) => {
  const orders = readJSON('orders.json', []);
  const { status, date, limit } = req.query;
  let result = orders;
  if (status) result = result.filter(o => o.status === status);
  if (date) result = result.filter(o => o.createdAt && o.createdAt.startsWith(date));
  if (limit) result = result.slice(0, parseInt(limit));
  // stats
  const today = new Date().toISOString().slice(0,10);
  const todayOrders = orders.filter(o => o.createdAt && o.createdAt.startsWith(today));
  res.json({
    ok: true,
    orders: result,
    stats: {
      todayCount: todayOrders.length,
      todayRevenue: todayOrders.filter(o=>o.status==='ส่งสำเร็จ').reduce((s,o)=>s+Number(o.total||0),0),
      pending: orders.filter(o=>o.status==='รอยืนยัน').length,
      delivering: orders.filter(o=>o.status==='กำลังส่ง').length,
    }
  });
});

app.get('/orders/active', (req, res) => {
  const active = ['รอยืนยัน','ยืนยันแล้ว','รอรอบ','กำลังทำ','กำลังส่ง'];
  const orders = readJSON('orders.json', []).filter(o => active.includes(o.status));
  res.json({ ok: true, orders });
});

app.patch('/orders/:orderId/status', (req, res) => {
  const orders = readJSON('orders.json', []);
  const idx = orders.findIndex(o => o.orderId === req.params.orderId);
  if (idx < 0) return res.json({ ok: false, error: 'not found' });
  const oldStatus = orders[idx].status;
  orders[idx].status = req.body.status;
  orders[idx].updatedAt = new Date().toISOString();
  if (req.body.rider) orders[idx].rider = req.body.rider;
  if (req.body.note) orders[idx].note = req.body.note;
  writeJSON('orders.json', orders);
  res.json({ ok: true, order: orders[idx] });
});

// ─────────────────────────────────────────────────
// RIDER — ยืนยันส่ง
// ─────────────────────────────────────────────────
app.post('/rider/confirm', (req, res) => {
  const { orderId, note, photoBase64 } = req.body;
  const orders = readJSON('orders.json', []);
  const idx = orders.findIndex(o => o.orderId === orderId);
  if (idx < 0) return res.json({ ok: false, error: 'not found' });
  orders[idx].status = 'ส่งสำเร็จ';
  orders[idx].deliveredAt = new Date().toISOString();
  orders[idx].riderNote = note || '';
  if (photoBase64) {
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
    const filename = 'delivery_' + orderId + '_' + Date.now() + '.jpg';
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), Buffer.from(base64Data, 'base64'));
    orders[idx].deliveryPhoto = '/uploads/' + filename;
  }
  writeJSON('orders.json', orders);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────
// CUSTOMERS (CRM)
// ─────────────────────────────────────────────────
function upsertCustomer(order) {
  const customers = readJSON('customers.json', []);
  const uid = order.lineUserId || order.customerPhone;
  if (!uid) return;
  const today = new Date().toISOString().slice(0,10);
  const idx = customers.findIndex(c => c.uid === uid);
  if (idx >= 0) {
    customers[idx].name = order.customerName || customers[idx].name;
    customers[idx].phone = order.customerPhone || customers[idx].phone;
    customers[idx].lastAddress = order.address;
    customers[idx].orderCount = (customers[idx].orderCount || 0) + 1;
    customers[idx].totalSpent = (customers[idx].totalSpent || 0) + Number(order.total || 0);
    customers[idx].lastOrder = today;
  } else {
    customers.push({
      uid, name: order.customerName, phone: order.customerPhone,
      lineUserId: order.lineUserId || '', lastAddress: order.address,
      mapsLink: order.mapsLink || '', orderCount: 1,
      totalSpent: Number(order.total || 0), firstOrder: today, lastOrder: today,
    });
  }
  writeJSON('customers.json', customers);
}

app.get('/customers', (req, res) => {
  res.json({ ok: true, customers: readJSON('customers.json', []) });
});

// ─────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'อมรินทร์ โคตรเนื้อ API', version: '1.0.0', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log('🥩 อมรินทร์ API running at http://localhost:' + PORT);
  console.log('📁 Data directory:', DATA_DIR);
});

module.exports = app;
