import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { ShoppingBag, Plus, Minus, ClipboardList, Wine, CheckCircle2, Clock3, Languages, LogIn, RefreshCw } from 'lucide-react';
import './style.css';

const menu = [
  { id: 1, category: 'Cocktails', name: 'Old Fashioned', zh: '古典鸡尾酒', desc: 'Bourbon, bitters, sugar, orange', zhDesc: '波本威士忌、苦精、糖与橙皮', price: 14, emoji: '🥃' },
  { id: 2, category: 'Cocktails', name: 'Margarita', zh: '玛格丽特', desc: 'Tequila, lime, orange liqueur', zhDesc: '龙舌兰、青柠与橙味利口酒', price: 13, emoji: '🍸' },
  { id: 3, category: 'Cocktails', name: 'Espresso Martini', zh: '浓缩咖啡马天尼', desc: 'Vodka, espresso, coffee liqueur', zhDesc: '伏特加、浓缩咖啡与咖啡利口酒', price: 15, emoji: '☕' },
  { id: 4, category: 'Cocktails', name: 'Negroni', zh: '内格罗尼', desc: 'Gin, vermouth rosso, bitter aperitif', zhDesc: '金酒、红味美思与开胃苦酒', price: 14, emoji: '🍹' },
  { id: 5, category: 'Cocktails', name: 'Moscow Mule', zh: '莫斯科骡子', desc: 'Vodka, ginger beer, fresh lime', zhDesc: '伏特加、姜汁汽水与鲜青柠', price: 13, emoji: '🍋' }
];
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const money = n => '$' + Number(n).toFixed(2);

function App() {
  const isAdmin = new URLSearchParams(location.search).get('admin') === '1';
  const [lang, setLang] = useState('en');
  const [tab, setTab] = useState('menu');
  const [cart, setCart] = useState({});
  const [orders, setOrders] = useState(() => JSON.parse(localStorage.getItem('bar-orders') || '[]'));
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState(null);
  const [staffOrders, setStaffOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const table = new URLSearchParams(location.search).get('table') || '12';
  const t = (en, zh) => lang === 'en' ? en : zh;
  const count = Object.values(cart).reduce((a,b) => a+b, 0);
  const total = menu.reduce((sum, x) => sum + x.price * (cart[x.id] || 0), 0);
  const add = id => setCart(c => ({...c, [id]: (c[id] || 0) + 1}));
  const remove = id => setCart(c => { const n = {...c}; if ((n[id] || 0) <= 1) delete n[id]; else n[id]--; return n; });
  const statusLabel = s => ({received:t('Received','已收到'),preparing:t('Preparing','制作中'),ready:t('Ready','已完成')})[s] || s;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin || !supabase || !session) return;
    let alive = true;
    const load = async () => {
      const {data,error} = await supabase.from('orders').select('*').order('created_at',{ascending:false});
      if (alive && !error) setStaffOrders(data || []);
      if (error) setNotice(error.message);
    };
    load();
    const channel = supabase.channel('bar-orders-live').on('postgres_changes',{event:'*',schema:'public',table:'orders'},load).subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [isAdmin, session]);

  // Customer devices only retrieve their own order status using an unguessable tracking token.
  useEffect(() => {
    if (isAdmin || !supabase) return;
    const tracked = orders.filter(o => o.trackingToken && typeof o.id === 'string');
    if (!tracked.length) return;
    let alive = true;
    const refreshStatuses = async () => {
      const updates = await Promise.all(tracked.map(async order => {
        const { data, error } = await supabase.rpc('get_customer_order_status', {
          p_order_id: order.id,
          p_tracking_token: order.trackingToken
        });
        if (error || !data || !data.length) return null;
        return { id: order.id, status: data[0].status };
      }));
      if (!alive) return;
      const byId = new Map(updates.filter(Boolean).map(x => [x.id, x.status]));
      if (!byId.size) return;
      setOrders(current => {
        const next = current.map(o => byId.has(o.id) ? {...o, status: byId.get(o.id)} : o);
        localStorage.setItem('bar-orders', JSON.stringify(next));
        return next;
      });
    };
    refreshStatuses();
    const timer = setInterval(refreshStatuses, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [isAdmin, orders.length]);

  const submit = async () => {
    if (!count) return;
    const lines = menu.filter(x => cart[x.id]).map(x => ({id:x.id,name:x.name,zh:x.zh,qty:cart[x.id],price:x.price}));
    const orderId = crypto.randomUUID();
    const trackingToken = crypto.randomUUID() + crypto.randomUUID();
    const order = { id: orderId, trackingToken: supabase ? trackingToken : null, table_number: String(table), items: lines, total, status: 'received' };
    if (supabase) {
      setBusy(true);
      const {error} = await supabase.from('orders').insert({id:orderId,tracking_token:trackingToken,table_number:String(table),items:lines,total,status:'received'});
      setBusy(false);
      if (error) { setNotice(t('Could not send order: ','订单提交失败：') + error.message); return; }
      setNotice(t('Order sent to the bar! Pay at the counter.','订单已发送到吧台，请到吧台付款。'));
    } else {
      setNotice(t('Demo order saved on this device. Connect Supabase for shared live orders.','演示订单已保存在本设备。连接 Supabase 后才能跨设备实时共享。'));
    }
    const next = [order,...orders]; setOrders(next); localStorage.setItem('bar-orders',JSON.stringify(next));
    setCart({}); setSent(true); setTab('orders');
  };

  const login = async e => {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); const {error} = await supabase.auth.signInWithPassword({email,password}); setBusy(false);
    setNotice(error ? error.message : t('Staff signed in.','员工登录成功。'));
  };
  const changeStatus = async (id,status) => {
    const {error} = await supabase.from('orders').update({status}).eq('id',id);
    if (error) setNotice(error.message);
  };

  if (isAdmin) return <div className="app"><header className="top"><div className="brand"><div className="brandmark"><Wine size={21}/></div><div><b>THE POUR HOUSE</b><small>STAFF ORDER DASHBOARD</small></div></div><a className="lang" href="/">Customer menu ↗</a></header><main>
    <section className="welcome"><div className="eyebrow">STAFF ONLY</div><h1>Order <em>dashboard.</em></h1><p>Live incoming cocktail orders and preparation status.</p></section>
    {!supabase ? <div className="success">Backend is not connected yet. Add the Supabase URL and anon key to your deployment environment, then reload.</div> : !session ? <form className="stafflogin" onSubmit={login}><h2>Staff sign in</h2><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><button disabled={busy}><LogIn size={16}/> Sign in</button></form> : <><div className="sectionhead"><div><div className="eyebrow">LIVE QUEUE</div><h2>Incoming orders</h2></div><button className="lang" onClick={()=>supabase.auth.signOut()}>Sign out</button></div>{notice&&<div className="success">{notice}</div>}{staffOrders.length===0?<div className="empty"><ClipboardList size={30}/><h3>No orders yet</h3><p>New customer orders will appear here automatically.</p></div>:staffOrders.map(o=><article className="ordercard" key={o.id}><div className="orderhead"><b>Table #{o.table_number}</b><span><Clock3 size={14}/>{statusLabel(o.status)}</span></div>{(o.items||[]).map((line,i)=><p key={i}>{line.qty} × {line.name}</p>)}<strong>{money(o.total)}</strong><div className="statusactions"><button onClick={()=>changeStatus(o.id,'preparing')}>Start preparing</button><button onClick={()=>changeStatus(o.id,'ready')}>Mark ready</button></div></article>)}</>}
    <footer>Payment is collected at the bar. Keep this dashboard on the staff device.</footer></main></div>;

  return <div className="app">
    <header className="top"><div className="brand"><div className="brandmark"><Wine size={21}/></div><div><b>THE POUR HOUSE</b><small>{t('GOOD DRINKS. GOOD COMPANY.','好酒相伴，美好时光。')}</small></div></div><div className="topactions"><a className="lang" href="/?admin=1">{t('Staff dashboard','员工后台')} ↗</a><button className="lang" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}><Languages size={17}/>{lang === 'en' ? '中文' : 'English'}</button></div></header>
    <main>    <section className="brand-hero">
      <div className="hero-copy">
        <div className="eyebrow">THE POUR HOUSE · COCKTAIL CULTURE</div>
        <h1>Good spirits.<br/><em>Better nights.</em></h1>
        <p>{t('Discover crafted cocktails, signature pours and a place to slow down.','探索匠心鸡尾酒、招牌特调，在这里享受美好夜晚。')}</p>
        <div className="hero-actions"><a href="#menu" className="primary-link">{t('Explore the menu','探索酒单')} ↗</a><a href="#experience" className="secondary-link">{t('Discover our bar','了解酒吧')}</a></div>
      </div>
      <div className="hero-art"><div className="hero-orbit orbit-one"></div><div className="hero-orbit orbit-two"></div><div className="hero-glass">🍸</div><div className="hero-caption">CRAFTED<br/>FOR THE MOMENT</div></div>
    </section>
    <nav className="brand-nav"><a href="#menu">{t('Cocktail menu','鸡尾酒菜单')}</a><a href="#experience">{t('The experience','酒吧体验')}</a><a href="#events">{t('Events','活动')}</a><a href="#visit">{t('Visit us','到店信息')}</a></nav>
<section className="welcome"><div className="eyebrow">{t('WELCOME IN','欢迎光临')}</div><h1>{t('Your table,','您的餐桌，')}<em>{t('your order.','您的点单。')}</em></h1><p>{t('Explore our cocktail menu and order when you’re ready.','浏览鸡尾酒菜单，准备好后即可下单。')}</p><div className="tabletag">{t('TABLE','桌号')} <strong>#{table}</strong></div></section>
    <nav className="tabs"><button className={tab==='menu'?'active':''} onClick={()=>setTab('menu')}><Wine size={17}/>{t('Cocktails','鸡尾酒')}</button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}><ClipboardList size={17}/>{t('My orders','我的订单')}{orders.length>0&&<span className="dot">{orders.length}</span>}</button></nav>
    {tab==='menu' ? <><div className="sectionhead" id="menu"><div><div className="eyebrow">{t('MIXED TO PERFECTION','匠心调制')}</div><h2>{t('Cocktail menu','鸡尾酒菜单')}</h2></div><span className="muted">{t('Prices in USD','美元计价')}</span></div><div className="menu">{menu.map(x=><article className="item" key={x.id}><div className="drinkicon">{x.emoji}</div><div className="iteminfo"><h3>{t(x.name,x.zh)}</h3><p>{t(x.desc,x.zhDesc)}</p><b>{money(x.price)}</b></div><div className="quantity">{cart[x.id]?<><button onClick={()=>remove(x.id)}><Minus size={15}/></button><strong>{cart[x.id]}</strong><button onClick={()=>add(x.id)}><Plus size={15}/></button></>:<button className="add" onClick={()=>add(x.id)}><Plus size={17}/></button>}</div></article>)}</div>{count>0&&<div className="checkout"><div><small>{t('YOUR ORDER','您的订单')}</small><strong>{count} {t('items','件商品')} · {money(total)}</strong></div><button disabled={busy} onClick={submit}>{busy?t('Sending…','提交中…'):t('Place order','提交订单')}<span>→</span></button></div>}</> : <><div className="sectionhead"><div><div className="eyebrow">{t('AT YOUR PACE','随时查看')}</div><h2>{t('My orders','我的订单')}</h2></div></div>{sent&&<div className="success"><CheckCircle2 size={19}/>{notice}</div>}{orders.length===0?<div className="empty"><ShoppingBag size={30}/><h3>{t('No demo orders yet','暂无本机演示订单')}</h3><p>{t('Submitted demo orders on this device show up here.','本设备提交的演示订单会显示在这里。')}</p><button onClick={()=>setTab('menu')}>{t('Browse cocktails','浏览鸡尾酒')}</button></div>:orders.map(o=><article className="ordercard" key={o.id}><div className="orderhead"><b>#{String(o.id).slice(-5)} · {t('Table','桌号')} {o.table_number}</b><span><Clock3 size={14}/>{statusLabel(o.status)}</span></div>{o.items.map((l,i)=><p key={i}>{l.qty} × {t(l.name,l.zh)}</p>)}<strong>{money(o.total)}</strong>{o.trackingToken&&<div className="trackinghint">{t('Order status updates automatically every few seconds.','订单状态每几秒自动更新。')}</div>}</article>)}</>}
    {tab==='menu'&&<div className="brand-panels">
      <section className="brand-panel" id="experience"><div className="eyebrow">{t('MORE THAN A DRINK','不止一杯酒')}</div><h2>{t('A place for the moments worth remembering.','为值得铭记的时刻而来。')}</h2><p>{t('Thoughtfully mixed cocktails, warm hospitality and an atmosphere made for good company.','精心调制的鸡尾酒、温暖的待客之道，以及适合好友相聚的氛围。')}</p><div className="panel-tags"><span>CRAFT COCKTAILS</span><span>GOOD COMPANY</span><span>GREAT MOMENTS</span></div></section>
      <section className="brand-panel event-panel" id="events"><div className="eyebrow">{t('WHAT’S ON','近期活动')}</div><h2>{t('Make tonight your occasion.','让今晚成为特别的夜晚。')}</h2><p>{t('Ask our team about seasonal creations, tasting nights and upcoming bar events.','欢迎向我们的团队了解季节特调、品鉴之夜和即将举行的酒吧活动。')}</p><a href="#visit">{t('Plan your visit','计划到店')} ↗</a></section>
      <section className="visit-panel" id="visit"><div><div className="eyebrow">{t('COME ON IN','欢迎光临')}</div><h2>{t('Your seat is waiting.','为你留一席。')}</h2><p>{t('Order from your table or visit the bar to pay. Our team will take care of the rest.','在餐桌扫码点单，前往吧台付款，剩下的交给我们的团队。')}</p></div><a href="#menu" className="primary-link">{t('Browse cocktails','浏览鸡尾酒')} ↗</a></section>
    </div>}
    {notice&&!sent&&<div className="notice">{notice}</div>}
    <footer>{t('Please enjoy responsibly. Payment is made at the bar.','请理性饮酒。订单请到吧台付款。')}<br/>© THE POUR HOUSE</footer></main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
