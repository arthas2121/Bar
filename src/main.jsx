import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { ShoppingBag, Plus, Minus, ClipboardList, Wine, CheckCircle2, Clock3, Languages, LogIn, RefreshCw } from 'lucide-react';
import './style.css';
import './ambience.css';
import { ReservationPanel, DYODPanel, InventoryPanel, ReservationsAdmin } from './features.jsx';

const menu = [
  { id: 1, category: 'Cocktails', name: 'Haystack', zh: 'Haystack', desc: 'Signature cocktail', zhDesc: '招牌鸡尾酒', price: null, emoji: '🍸', image: '/images/01-haystack.webp' },
  { id: 2, category: 'Cocktails', name: 'Paper Plane', zh: 'Paper Plane', desc: 'Signature cocktail', zhDesc: '招牌鸡尾酒', price: null, emoji: '🍹', image: '/images/02-paper-plane.webp' },
  { id: 3, category: 'Cocktails', name: 'Rosita', zh: 'Rosita', desc: 'Signature cocktail', zhDesc: '招牌鸡尾酒', price: null, emoji: '🥃', image: '/images/03-rosita.webp' },
  { id: 4, category: 'Cocktails', name: 'Oolong Osmanthus Negroni', zh: '乌龙桂花 Negroni', desc: 'Oolong tea and osmanthus signature cocktail', zhDesc: '乌龙茶与桂花风味特调', price: null, emoji: '🍊', image: '/images/04-oolong-osmanthus-negroni.webp' },
  { id: 5, category: 'Cocktails', name: 'Oolong Osmanthus White Negroni', zh: '乌龙桂花 White Negroni', desc: 'White Negroni with oolong tea and osmanthus', zhDesc: '乌龙茶与桂花风味白 Negroni', price: null, emoji: '🍸', image: '/images/05-oolong-osmanthus-white-negroni.webp' },
  { id: 6, category: 'Cocktails', name: 'Aviation', zh: 'Aviation', desc: 'Classic floral cocktail', zhDesc: '经典花香风味鸡尾酒', price: null, emoji: '🪻', image: '/images/06-aviation.webp' }
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
  const [selectedCocktail, setSelectedCocktail] = useState(null);
  const table = new URLSearchParams(location.search).get('table') || '12';
  const t = (en, zh) => lang === 'en' ? en : zh;
  const count = Object.values(cart).reduce((a,b) => a+b, 0);
  const hasUnpricedItems = menu.some(x => cart[x.id] && x.price == null);
  const total = hasUnpricedItems ? null : menu.reduce((sum, x) => sum + x.price * (cart[x.id] || 0), 0);
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
    if (hasUnpricedItems) { setNotice(t('Prices will be confirmed at the bar. Ordering will open once prices are added.','价格将在吧台确认，录入价格后即可开放下单。')); return; }
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

  const submitDyodOrder = async recipe => {
    const recipeName = recipe.name_en || recipe.name || recipe.name_zh || 'Custom cocktail';
    const line = { type:'dyod', qty:1, name:recipeName, zh:recipe.name_zh || recipeName, recipe };
    const orderId = crypto.randomUUID();
    const trackingToken = crypto.randomUUID() + crypto.randomUUID();
    const order = { id:orderId, trackingToken:supabase ? trackingToken : null, table_number:String(table), items:[line], total:0, status:'received' };
    if (supabase) {
      setBusy(true);
      const {error} = await supabase.from('orders').insert({id:orderId,tracking_token:trackingToken,table_number:String(table),items:[line],total:0,status:'received'});
      setBusy(false);
      if (error) { setNotice(t('Could not send custom cocktail order: ','专属鸡尾酒下单失败：')+error.message); return; }
      setNotice(t('Your custom cocktail order was sent to the bar. Pay at the counter.','专属鸡尾酒订单已发送到吧台，请到吧台付款。'));
    } else {
      setNotice(t('Demo order saved on this device.','演示订单已保存在本设备。'));
    }
    const next=[order,...orders]; setOrders(next); localStorage.setItem('bar-orders',JSON.stringify(next));
    setSent(true); setTab('orders');
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

  if (isAdmin) return <div className="app"><header className="top"><div className="brand"><div className="brandmark"><Wine size={21}/></div><div><b>ACE BAR</b><small>员工订单管理后台</small></div></div><a className="lang" href="/">返回顾客点单页 ↗</a></header><main>
    <section className="welcome"><div className="eyebrow">员工专用</div><h1>订单<em>管理后台</em></h1><p>实时查看顾客订单，并更新鸡尾酒制作进度。</p></section>
    {!supabase ? <div className="success">后台服务尚未连接。请检查部署环境中的 Supabase 配置后重新载入。</div> : !session ? <form className="stafflogin" onSubmit={login}><h2>员工登录</h2><label>邮箱</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><label>密码</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><button disabled={busy}><LogIn size={16}/> {busy?'登录中…':'登录'}</button></form> : <><div className="sectionhead"><div><div className="eyebrow">实时订单</div><h2>待处理订单</h2></div><button className="lang" onClick={()=>supabase.auth.signOut()}>退出登录</button></div>{notice&&<div className="success">{notice}</div>}{staffOrders.length===0?<div className="empty"><ClipboardList size={30}/><h3>暂时没有新订单</h3><p>顾客提交的新订单会自动显示在这里。</p></div>:staffOrders.map(o=><article className="ordercard" key={o.id}><div className="orderhead"><b>{o.table_number} 号桌</b><span><Clock3 size={14}/>{{received:'已收到',preparing:'制作中',ready:'已完成'}[o.status]||o.status}</span></div>{(o.items||[]).map((line,i)=><div key={i} className="order-line"><p>{line.qty} × {line.name}</p>{line.type==='dyod'&&line.recipe&&<div className="order-recipe"><b>{line.recipe.name_en||line.recipe.name} / {line.recipe.name_zh||''}</b><p>{line.recipe.story_en||line.recipe.story}</p><p>{line.recipe.story_zh||''}</p><b>Ingredients / 配方材料</b><ul>{(line.recipe.ingredients||[]).map((ing,j)=><li key={j}>{ing.amount} {ing.name} / {ing.name_zh||ing.name}</li>)}</ul><b>Method / 制作方法</b><p>{line.recipe.method_en||line.recipe.method}</p><p>{line.recipe.method_zh||''}</p>{line.recipe.glassware_en&&<p>Glassware / 杯型: {line.recipe.glassware_en} / {line.recipe.glassware_zh||''}</p>}</div>}</div>)}<strong>{(o.items||[]).some(x=>x.type==='dyod') ? '专属创作 · 吧台确认价格' : o.total == null ? '吧台付款' : money(o.total)}</strong><div className="statusactions"><button onClick={()=>changeStatus(o.id,'preparing')}>开始制作</button><button onClick={()=>changeStatus(o.id,'ready')}>标记为已完成</button></div></article>)}</>}
    {session&&supabase&&<><InventoryPanel supabase={supabase}/><ReservationsAdmin supabase={supabase}/></>}
    <footer>顾客请在吧台付款。请在员工设备上保持此管理页面开启。</footer></main></div>;

  return <div className="app">
    <header className="top"><div className="brand"><div className="brandmark"><Wine size={21}/></div><div><b>ACE BAR</b><small>{t('GOOD DRINKS. GOOD COMPANY.','好酒相伴，美好时光。')}</small></div></div><div className="topactions"><a className="lang" href="/?admin=1">{t('Staff dashboard','员工后台')} ↗</a><button className="lang" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}><Languages size={17}/>{lang === 'en' ? '中文' : 'English'}</button></div></header>
    <main>    <section className="brand-hero">
      <div className="hero-copy">
        <div className="eyebrow">ACE BAR · COCKTAIL CULTURE</div>
        <h1>Good spirits.<br/><em>Better nights.</em></h1>
        <p>{t('Discover crafted cocktails, signature pours and a place to slow down.','探索匠心鸡尾酒、招牌特调，在这里享受美好夜晚。')}</p>
        <div className="hero-actions"><a href="#menu" className="primary-link">{t('Explore the menu','探索酒单')} ↗</a><a href="#visit" className="secondary-link">{t('Plan your visit','预约到店')}</a></div>
      </div>
      <div className="hero-art"><div className="hero-orbit orbit-one"></div><div className="hero-orbit orbit-two"></div><div className="hero-glass">🍸</div><div className="hero-caption">CRAFTED<br/>FOR THE MOMENT</div></div>
    </section>
    <nav className="brand-nav"><button type="button" onClick={()=>{setTab('menu');setTimeout(()=>document.getElementById('menu')?.scrollIntoView({behavior:'smooth',block:'start'}),80);}}>{t('Cocktail menu','鸡尾酒菜单')}</button><button type="button" onClick={()=>{setTab('dyod');setTimeout(()=>document.getElementById('dyod')?.scrollIntoView({behavior:'smooth',block:'start'}),80);}}>DYOD</button><button type="button" onClick={()=>{setTab('menu');setTimeout(()=>document.getElementById('visit')?.scrollIntoView({behavior:'smooth',block:'start'}),100);}}>{t('Reservations','预约')}</button></nav>
<section className="welcome"><div className="eyebrow">{t('WELCOME IN','欢迎光临')}</div><h1>{t('Your table,','您的餐桌，')}<em>{t('your order.','您的点单。')}</em></h1><p>{t('Explore our cocktail menu and order when you’re ready.','浏览鸡尾酒菜单，准备好后即可下单。')}</p><div className="tabletag">{t('TABLE','桌号')} <strong>#{table}</strong></div></section>
    <nav className="tabs"><button className={tab==='menu'?'active':''} onClick={()=>setTab('menu')}><Wine size={17}/>{t('Cocktails','鸡尾酒')}</button><button className={tab==='dyod'?'active':''} onClick={()=>setTab('dyod')}>✨ DYOD</button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}><ClipboardList size={17}/>{t('My orders','我的订单')}{orders.length>0&&<span className="dot">{orders.length}</span>}</button></nav>
    {tab==='dyod' ? <DYODPanel supabase={supabase} lang={lang} onOrder={submitDyodOrder}/> : tab==='menu' ? <><div className="sectionhead" id="menu"><div><div className="eyebrow">{t('MIXED TO PERFECTION','匠心调制')}</div><h2>{t('Cocktail menu','鸡尾酒菜单')}</h2></div><span className="muted">{t('Prices in USD','美元计价')}</span></div><div className="menu">{menu.map(x=><article className="item cocktail-item" key={x.id} role="button" tabIndex={0} onClick={()=>setSelectedCocktail(x)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedCocktail(x);}}}><img className="cocktail-thumb" src={x.image} alt={x.name} /><div className="iteminfo"><h3>{t(x.name,x.zh)}</h3><p>{t(x.desc,x.zhDesc)}</p><b>{x.price == null ? t('Price at bar','吧台确认价格') : money(x.price)}</b><small className="photo-hint">{t('Tap to view photo','点击查看大图')}</small></div><div className="quantity" onClick={e=>e.stopPropagation()}>{cart[x.id]?<><button onClick={()=>remove(x.id)}><Minus size={15}/></button><strong>{cart[x.id]}</strong><button onClick={()=>add(x.id)}><Plus size={15}/></button></>:<button className="add" onClick={()=>add(x.id)}><Plus size={17}/></button>}</div></article>)}</div>{selectedCocktail&&<div className="cocktail-lightbox" role="presentation" onClick={()=>setSelectedCocktail(null)}><div className="cocktail-lightbox-card" role="dialog" aria-modal="true" aria-label={selectedCocktail.name} onClick={e=>e.stopPropagation()}><button className="cocktail-lightbox-close" onClick={()=>setSelectedCocktail(null)} aria-label={t('Close','关闭')}>×</button><img src={selectedCocktail.image} alt={selectedCocktail.name}/><div className="cocktail-lightbox-info"><h2>{t(selectedCocktail.name,selectedCocktail.zh)}</h2><p>{t(selectedCocktail.desc,selectedCocktail.zhDesc)}</p><b>{selectedCocktail.price == null ? t('Price at bar','吧台确认价格') : money(selectedCocktail.price)}</b></div></div></div>}{count>0&&<div className="checkout"><div><small>{t('YOUR ORDER','您的订单')}</small><strong>{count} {t('items','件商品')} · {total == null ? t('Pay at bar','吧台付款') : money(total)}</strong></div><button disabled={busy || hasUnpricedItems} onClick={submit}>{busy?t('Sending…','提交中…'):t('Place order','提交订单')}<span>→</span></button></div>}</> : <><div className="sectionhead"><div><div className="eyebrow">{t('AT YOUR PACE','随时查看')}</div><h2>{t('My orders','我的订单')}</h2></div></div>{sent&&<div className="success"><CheckCircle2 size={19}/>{notice}</div>}{orders.length===0?<div className="empty"><ShoppingBag size={30}/><h3>{t('No demo orders yet','暂无本机演示订单')}</h3><p>{t('Submitted demo orders on this device show up here.','本设备提交的演示订单会显示在这里。')}</p><button onClick={()=>setTab('menu')}>{t('Browse cocktails','浏览鸡尾酒')}</button></div>:orders.map(o=><article className="ordercard" key={o.id}><div className="orderhead"><b>#{String(o.id).slice(-5)} · {t('Table','桌号')} {o.table_number}</b><span><Clock3 size={14}/>{statusLabel(o.status)}</span></div>{o.items.map((l,i)=><p key={i}>{l.qty} × {t(l.name,l.zh)}</p>)}<strong>{money(o.total)}</strong>{o.trackingToken&&<div className="trackinghint">{t('Order status updates automatically every few seconds.','订单状态每几秒自动更新。')}</div>}</article>)}</>}
    {tab==='menu'&&<ReservationPanel supabase={supabase} lang={lang}/>}
    {notice&&!sent&&<div className="notice">{notice}</div>}
    <footer>{t('Please enjoy responsibly. Payment is made at the bar.','请理性饮酒。订单请到吧台付款。')}<br/>© ACE BAR</footer></main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
