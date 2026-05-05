const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
let sb = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase connected');
  } catch(e) { console.log('⚠️ Supabase error:', e.message); }
}

// JSON fallback
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
[DATA_DIR, UPLOAD_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
function rj(f, d) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch(e) { return d; } }
function wj(f, d) { fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(d, null, 2)); }

function seed() {
  if (!fs.existsSync(path.join(DATA_DIR, 'menu.json'))) {
    wj('menu.json', [
      {id:1,name:'เนื้อตุ๋นโคตรนุ่ม',cat:'เนื้อ',price:159,img:'🥩',desc:'เนื้อตุ๋นเปื่อย หอมเครื่องเทศ',stock:999,status:'เปิด',signature:true,sort_order:1},
      {id:2,name:'เนื้อทอดกระเทียมโคตรกรอบ',cat:'เนื้อ',price:139,img:'🍖',desc:'ทอดกรอบ กระเทียมหอม',stock:999,status:'เปิด',signature:true,sort_order:2},
      {id:3,name:'สเต็กเนื้อโคตรกรอบ',cat:'เนื้อ',price:199,img:'🥩',desc:'สันใน ย่างกรอบ',stock:999,status:'เปิด',signature:true,sort_order:3},
      {id:4,name:'หมูทอดกระเทียม',cat:'หมู',price:89,img:'🐷',desc:'หมูทอดกรอบ กระเทียมหอม',stock:999,status:'เปิด',signature:false,sort_order:4},
      {id:5,name:'หมูย่างซีอิ๊ว',cat:'หมู',price:99,img:'🐷',desc:'หมูย่างหวานหอม',stock:999,status:'เปิด',signature:false,sort_order:5},
    ]);
  }
  ['promos','orders','customers'].forEach(f => { if (!fs.existsSync(path.join(DATA_DIR, f+'.json'))) wj(f+'.json',[]); });
}
seed();

app.get('/', (req, res) => res.json({ ok:true, service:'อมรินทร์ API', version:'2.0.0', db: sb?'supabase':'json' }));

// MENU
app.get('/menu', async (req, res) => {
  try {
    let menu;
    if (sb) {
      const { data, error } = await sb.from('menu').select('*').eq('status','เปิด').order('sort_order');
      if (error) throw error;
      menu = data || [];
    } else {
      menu = rj('menu.json',[]).filter(m=>m.status!=='ปิด').sort((a,b)=>(a.sort_order||99)-(b.sort_order||99));
    }
    res.json({ ok:true, menu });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.get('/menu/all', async (req, res) => {
  try {
    let menu;
    if (sb) {
      const { data, error } = await sb.from('menu').select('*').order('sort_order');
      if (error) throw error;
      menu = data || [];
    } else {
      menu = rj('menu.json',[]).sort((a,b)=>(a.sort_order||99)-(b.sort_order||99));
    }
    res.json({ ok:true, menu });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.post('/menu', async (req, res) => {
  try {
    const item = { ...req.body };
    item.id = item.id || (Date.now()%100000);
    item.status = item.status||'เปิด';
    item.sort_order = item.sortOrder||item.sort_order||99;
    if (sb) {
      const { error } = await sb.from('menu').upsert(item, { onConflict:'id' });
      if (error) throw error;
    } else {
      const menu = rj('menu.json',[]);
      const idx = menu.findIndex(m=>m.id==item.id);
      if (idx>=0) menu[idx]={...menu[idx],...item}; else menu.push(item);
      wj('menu.json', menu);
    }
    res.json({ ok:true, item });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.delete('/menu/:id', async (req, res) => {
  try {
    if (sb) { const { error } = await sb.from('menu').delete().eq('id', req.params.id); if (error) throw error; }
    else { wj('menu.json', rj('menu.json',[]).filter(m=>m.id!=req.params.id)); }
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.patch('/menu/:id/status', async (req, res) => {
  try {
    if (sb) { await sb.from('menu').update({ status:req.body.status }).eq('id', req.params.id); }
    else {
      const menu = rj('menu.json',[]);
      const idx = menu.findIndex(m=>m.id==req.params.id);
      if (idx>=0) { menu[idx].status=req.body.status; wj('menu.json',menu); }
    }
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.post('/menu/upload-image', async (req, res) => {
  try {
    const { id, imageBase64 } = req.body;
    if (!imageBase64) return res.json({ ok:false, error:'no image' });
    if (sb) {
      await sb.from('menu').update({ img: imageBase64 }).eq('id', id);
      res.json({ ok:true, imageUrl: imageBase64 });
    } else {
      const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const fn = 'menu_'+id+'_'+Date.now()+'.jpg';
      fs.writeFileSync(path.join(UPLOAD_DIR, fn), Buffer.from(b64,'base64'));
      const url = '/uploads/'+fn;
      const menu = rj('menu.json',[]);
      const idx = menu.findIndex(m=>m.id==id);
      if (idx>=0) { menu[idx].img=url; wj('menu.json',menu); }
      res.json({ ok:true, imageUrl:url });
    }
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.use('/uploads', express.static(UPLOAD_DIR));

// PROMOS
app.get('/promos', async (req, res) => {
  try {
    let promos;
    if (sb) { const { data } = await sb.from('promos').select('*').eq('status','เปิด'); promos=data||[]; }
    else promos=rj('promos.json',[]).filter(p=>p.status!=='ปิด');
    res.json({ ok:true, promos });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.get('/promos/all', async (req, res) => {
  try {
    let promos;
    if (sb) { const { data } = await sb.from('promos').select('*'); promos=data||[]; }
    else promos=rj('promos.json',[]);
    res.json({ ok:true, promos });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.post('/promos', async (req, res) => {
  try {
    const p = { ...req.body, id:req.body.id||('P'+Date.now().toString().slice(-4)), status:'เปิด' };
    if (sb) { await sb.from('promos').upsert(p,{onConflict:'id'}); }
    else { const ps=rj('promos.json',[]); const idx=ps.findIndex(x=>x.id===p.id); if(idx>=0)ps[idx]=p; else ps.push(p); wj('promos.json',ps); }
    res.json({ ok:true, promo:p });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.delete('/promos/:id', async (req, res) => {
  try {
    if (sb) await sb.from('promos').delete().eq('id', req.params.id);
    else { wj('promos.json', rj('promos.json',[]).filter(p=>p.id!==req.params.id)); }
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// ORDERS
app.post('/orders', async (req, res) => {
  try {
    const order = {
      ...req.body,
      order_id: req.body.orderId||req.body.order_id||('ORD'+Date.now().toString().slice(-8)),
      customer_name: req.body.customerName||req.body.customer_name||'',
      customer_phone: req.body.customerPhone||req.body.customer_phone||'',
      items_summary: req.body.itemsSummary||req.body.items_summary||'',
      pay_method: req.body.payMethod||req.body.pay_method||'',
      maps_link: req.body.mapsLink||req.body.maps_link||'',
      line_user_id: req.body.lineUserId||req.body.line_user_id||'',
      status: 'รอยืนยัน',
      created_at: new Date().toISOString()
    };
    if (sb) { const { error } = await sb.from('orders').insert(order); if (error) throw error; }
    else { const os=rj('orders.json',[]); os.unshift(order); wj('orders.json',os); }
    upsertCustomer(order);
    res.json({ ok:true, orderId:order.order_id });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.get('/orders', async (req, res) => {
  try {
    let orders;
    if (sb) {
      const { data } = await sb.from('orders').select('*').order('created_at',{ascending:false}).limit(200);
      orders = data||[];
    } else orders=rj('orders.json',[]);
    const today=new Date().toISOString().slice(0,10);
    const td=orders.filter(o=>(o.created_at||'').startsWith(today));
    res.json({
      ok:true, orders,
      stats:{
        todayCount:td.length,
        todayRevenue:td.filter(o=>o.status==='ส่งสำเร็จ').reduce((s,o)=>s+Number(o.total||0),0),
        pending:orders.filter(o=>o.status==='รอยืนยัน').length,
        delivering:orders.filter(o=>o.status==='กำลังส่ง').length,
      }
    });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.get('/orders/active', async (req, res) => {
  try {
    const active=['รอยืนยัน','ยืนยันแล้ว','รอรอบ','กำลังทำ','กำลังส่ง'];
    let orders;
    if (sb) { const { data } = await sb.from('orders').select('*').in('status',active).order('created_at',{ascending:false}); orders=data||[]; }
    else orders=rj('orders.json',[]).filter(o=>active.includes(o.status));
    res.json({ ok:true, orders });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.patch('/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    if (sb) { await sb.from('orders').update({ status:req.body.status, updated_at:new Date().toISOString() }).eq('order_id',orderId); }
    else {
      const os=rj('orders.json',[]); const idx=os.findIndex(o=>o.order_id===orderId||o.orderId===orderId);
      if (idx>=0) { os[idx].status=req.body.status; wj('orders.json',os); }
    }
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.post('/rider/confirm', async (req, res) => {
  try {
    const { orderId, note } = req.body;
    const upd = { status:'ส่งสำเร็จ', rider_note:note, delivered_at:new Date().toISOString() };
    if (sb) { await sb.from('orders').update(upd).eq('order_id',orderId); }
    else {
      const os=rj('orders.json',[]); const idx=os.findIndex(o=>o.order_id===orderId||o.orderId===orderId);
      if (idx>=0) { os[idx]={...os[idx],...upd}; wj('orders.json',os); }
    }
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// CUSTOMERS
async function upsertCustomer(order) {
  try {
    const uid = order.line_user_id||order.lineUserId||order.customer_phone||order.customerPhone;
    if (!uid) return;
    const today = new Date().toISOString().slice(0,10);
    if (sb) {
      const { data:ex } = await sb.from('customers').select('*').eq('uid',uid).single();
      if (ex) {
        await sb.from('customers').update({
          order_count:(ex.order_count||0)+1,
          total_spent:(ex.total_spent||0)+Number(order.total||0),
          last_order:today, last_address:order.address||ex.last_address
        }).eq('uid',uid);
      } else {
        await sb.from('customers').insert({
          uid, name:order.customer_name||order.customerName||'',
          phone:order.customer_phone||order.customerPhone||'',
          last_address:order.address||'', maps_link:order.maps_link||order.mapsLink||'',
          order_count:1, total_spent:Number(order.total||0),
          first_order:today, last_order:today
        });
      }
    }
  } catch(e) { console.error('upsertCustomer:', e.message); }
}

app.get('/customers', async (req, res) => {
  try {
    let customers;
    if (sb) { const { data } = await sb.from('customers').select('*').order('last_order',{ascending:false}); customers=data||[]; }
    else customers=rj('customers.json',[]);
    res.json({ ok:true, customers });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

app.listen(PORT, () => {
  console.log('🥩 อมรินทร์ API v2.0 at http://localhost:'+PORT);
  console.log('📦 DB:', sb ? 'Supabase ✅' : 'JSON file (no Supabase env)');
});
module.exports = app;
