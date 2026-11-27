import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { ShoppingBag, Plus, Minus, ClipboardList, Wine, CheckCircle2, Clock3, Languages, LogIn, RefreshCw } from 'lucide-react';
import './style.css';
import './ambience.css';
import { ReservationPanel, DYODPanel, InventoryPanel, ReservationsAdmin, DYODFeedback, DYODFeedbackInsights } from './features.jsx';

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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [selectedCocktail, setSelectedCocktail] = useState(null);
  const [guestName, setGuestName] = useState(() => localStorage.getItem('ace-bar-guest-name') || '');
  const table = 'Home Bar';
  const t = (en, zh) => lang === 'en' ? en : zh;
  const count = Object.values(cart).reduce((a,b) => a+b, 0);
  const total = 0;
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
    if (!guestName.trim()) { setNotice(t('Please enter your name before ordering.','请先输入你的姓名或昵称。')); return; }
    localStorage.setItem('ace-bar-guest-name', guestName.trim());
    const lines = menu.filter(x => cart[x.id]).map(x => ({id:x.id,name:x.name,zh:x.zh,qty:cart[x.id],price:x.price}));
    const orderId = crypto.randomUUID();
    const trackingToken = crypto.randomUUID() + crypto.randomUUID();
    const order = { id: orderId, trackingToken: supabase ? trackingToken : null, guest_name: guestName.trim(), table_number: String(table), items: lines, total, status: 'received' };
    if (supabase) {
      setBusy(true);
      const {error} = await supabase.from('orders').insert({id:orderId,tracking_token:trackingToken,guest_name:guestName.trim(),table_number:String(table),items:lines,total,status:'received'});
      setBusy(false);
      if (error) { setNotice(t('Could not send order: ','订单提交失败：') + error.message); return; }
      setNotice(t('Your order has been sent! We’ll prepare it soon.','订单已发送！我们很快为你准备。'));
    } else {
      setNotice(t('Demo order saved on this device. Connect Supabase for shared live orders.','演示订单已保存在本设备。连接 Supabase 后才能跨设备实时共享。'));
    }
    const next = [order,...orders]; setOrders(next); localStorage.setItem('bar-orders',JSON.stringify(next));
    setCart({}); setSent(true); setTab('orders');
  };

  const submitDyodOrder = async recipe => {
    if (!guestName.trim()) { setNotice(t('Please enter your name before ordering.','请先输入你的姓名或昵称。')); return; }
    localStorage.setItem('ace-bar-guest-name', guestName.trim());
    const recipeName = recipe.name_en || recipe.name || recipe.name_zh || 'Custom cocktail';
    const line = { type:'dyod', qty:1, name:recipeName, zh:recipe.name_zh || recipeName, recipe };
    const orderId = crypto.randomUUID();
    const trackingToken = crypto.randomUUID() + crypto.randomUUID();
    const order = { id:orderId, trackingToken:supabase ? trackingToken : null, guest_name:guestName.trim(), table_number:String(table), items:[line], total:0, status:'received' };
    if (supabase) {
      setBusy(true);
      const {error} = await supabase.from('orders').insert({id:orderId,tracking_token:trackingToken,guest_name:guestName.trim(),table_number:String(table),items:[line],total:0,status:'received'});
      setBusy(false);
      if (error) { setNotice(t('Could not send custom cocktail order: ','专属鸡尾酒下单失败：')+error.message); return; }
      setNotice(t('Your custom cocktail order has been sent!','专属鸡尾酒订单已发送！'));
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
  const clearAllOrders = async () => {
    if (!window.confirm('确定清空所有订单吗？此操作会删除所有顾客提交的订单，无法恢复。')) return;
    setBusy(true);
    const {error} = await supabase.from('orders').delete().not('id','is',null);
    setBusy(false);
    if (error) { setNotice('清空订单失败：'+error.message); return; }
    setStaffOrders([]);
    setNotice('所有订单已清空。');
  };
  const toggleOrderSelection = id => setSelectedOrderIds(current => current.includes(id) ? current.filter(x => x !== id) : [...current,id]);
  const deleteSelectedOrders = async () => {
    if (!selectedOrderIds.length) return;
    if (!window.confirm('确定删除选中的 '+selectedOrderIds.length+' 个订单吗？此操作无法恢复。')) return;
    setBusy(true);
    const {error} = await supabase.from('orders').delete().in('id',selectedOrderIds);
    setBusy(false);
    if (error) { setNotice('删除选中订单失败：'+error.message); return; }
    setStaffOrders(current => current.filter(order => !selectedOrderIds.includes(order.id)));
    setSelectedOrderIds([]); setSelectionMode(false); setNotice('选中的订单已删除。');
  };
  const changeStatus = async (id,status) => {
    const {error} = await supabase.from('orders').update({status}).eq('id',id);
    if (error) setNotice(error.message);
  };

  if (isAdmin) return <div className="app"><header className="top"><div className="brand"><div className="brandmark"><Wine size={21}/></div><div><b>ACE BAR</b><small>员工订单管理后台</small></div></div><a className="lang" href="/">返回顾客点单页 ↗</a></header><main>
    <section className="welcome"><div className="eyebrow">员工专用</div><h1>订单<em>管理后台</em></h1><p>实时查看顾客订单，并更新鸡尾酒制作进度。</p></section>
    {!supabase ? <div className="success">后台服务尚未连接。请检查部署环境中的 Supabase 配置后重新载入。</div> : !session ? <form className="stafflogin" onSubmit={login}><h2>员工登录</h2><label>邮箱</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><label>密码</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><button disabled={busy}><LogIn size={16}/> {busy?'登录中…':'登录'}</button></form> : <><div className="sectionhead"><div><div className="eyebrow">实时订单</div><h2>待处理订单</h2></div><div className="staff-order-tools"><button className="lang" onClick={()=>{setSelectionMode(v=>!v);setSelectedOrderIds([]);}} disabled={busy}>{selectionMode?'取消选择':'选择订单'}</button>{selectionMode&&<button className="clear-orders" onClick={deleteSelectedOrders} disabled={busy||selectedOrderIds.length===0}>删除选中（{selectedOrderIds.length}）</button>}<button className="clear-orders" onClick={clearAllOrders} disabled={busy}>一键清空订单</button><button className="lang" onClick={()=>supabase.auth.signOut()}>退出登录</button></div></div>{notice&&<div className="success">{notice}</div>}{staffOrders.length===0?<div className="empty"><ClipboardList size={30}/><h3>暂时没有新订单</h3><p>顾客提交的新订单会自动显示在这里。</p></div>:staffOrders.map(o=><article className="ordercard" key={o.id}>{selectionMode&&<label className="order-select"><input type="checkbox" checked={selectedOrderIds.includes(o.id)} onChange={()=>toggleOrderSelection(o.id)}/>选择此订单</label>}<div className="orderhead"><b>{o.guest_name || '未填写姓名'} · 新订单</b><span><Clock3 size={14}/>{{received:'已收到',preparing:'制作中',ready:'已完成'}[o.status]||o.status}</span></div>{(o.items||[]).map((line,i)=><div key={i} className="order-line"><p>{line.qty} × {line.name}</p>{line.type==='dyod'&&line.recipe&&<div className="order-recipe"><b>{line.recipe.name_en||line.recipe.name||''} / {line.recipe.name_zh||line.recipe.name_en||line.recipe.name||''}</b><p><b>Description / 酒款介绍</b></p><p>{line.recipe.description_en||line.recipe.story_en||line.recipe.story||''}</p><p>{line.recipe.description_zh||line.recipe.story_zh||line.recipe.story||''}</p>{(line.recipe.flavour_en||line.recipe.flavour_zh)&&<p>Flavour / 风味：{line.recipe.flavour_en||''} / {line.recipe.flavour_zh||''}</p>}{(line.recipe.aroma_en||line.recipe.aroma_zh)&&<p>Aroma / 香气：{line.recipe.aroma_en||''} / {line.recipe.aroma_zh||''}</p>}{line.recipe.qualityScore!=null&&<p><b>AI 平衡审核：</b>{line.recipe.qualityScore}/100 · 已通过</p>}<b>Ingredients / 配方材料</b><ul>{(line.recipe.ingredients||[]).map((ing,j)=><li key={j}>{ing.amount} {ing.name_en||ing.name||''} / {ing.name_zh||ing.name_en||ing.name||''}</li>)}</ul><b>Method / 制作方法</b><p>{line.recipe.method_en||line.recipe.method||''}</p><p>{line.recipe.method_zh||line.recipe.method||''}</p>{(line.recipe.glassware_en||line.recipe.glassware_zh)&&<p>Glassware / 杯型: {line.recipe.glassware_en||''} / {line.recipe.glassware_zh||''}</p>}{(line.recipe.garnish_en||line.recipe.garnish_zh)&&<p>Garnish / 装饰: {line.recipe.garnish_en||''} / {line.recipe.garnish_zh||''}</p>}{(line.recipe.occasion_en||line.recipe.occasion_zh)&&<p>Occasion / 适合场景: {line.recipe.occasion_en||''} / {line.recipe.occasion_zh||''}</p>}</div><DYODFeedback supabase={supabase} orderId={o.id} recipe={line.recipe}/>}</div>)}<strong>{(o.items||[]).some(x=>x.type==='dyod') ? '专属创作' : '家庭 Bar 订单'}</strong><div className="statusactions"><button onClick={()=>changeStatus(o.id,'preparing')}>开始制作</button><button onClick={()=>changeStatus(o.id,'ready')}>标记为已完成</button></div></article>)}</>}
    {session&&supabase&&<><InventoryPanel supabase={supabase}/><DYODFeedbackInsights supabase={supabase}/><ReservationsAdmin supabase={supabase}/></>}
    <footer>ACE BAR · 家庭调酒吧台 · 请理性饮酒。</footer></main></div>;

  return <div className="app">
    <header className="top"><div className="brand"><div className="brandmark"><Wine size={21}/></div><div><b>ACE BAR</b><small>{t('GOOD DRINKS. GOOD COMPANY.','好酒相伴，美好时光。')}</small></div></div><div className="topactions"><a className="lang" href="/?admin=1">{t('Staff dashboard','员工后台')} ↗</a><button className="lang" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}><Languages size={17}/>{lang === 'en' ? '中文' : 'English'}</button></div></header>
    <main>    <section className="brand-hero">
      <div className="hero-copy">
        <div className="eyebrow">ACE BAR · COCKTAIL CULTURE</div>
        <h1>Good spirits.<br/><em>Better nights.</em></h1>
        <p>{t('Discover crafted cocktails, signature pours and a place to slow down.','探索匠心鸡尾酒、招牌特调，在这里享受美好夜晚。')}</p>
        <div className="hero-actions"><a href="#menu" className="primary-link">{t('Explore the menu','探索酒单')} ↗</a></div>
      </div>
      <div className="hero-art"><div className="hero-orbit orbit-one"></div><div className="hero-orbit orbit-two"></div><div className="hero-glass">🍸</div><div className="hero-caption">CRAFTED<br/>FOR THE MOMENT</div></div>
    </section>
    <nav className="brand-nav"><button type="button" onClick={()=>{setTab('menu');setTimeout(()=>document.getElementById('menu')?.scrollIntoView({behavior:'smooth',block:'start'}),80);}}>{t('Cocktail menu','鸡尾酒菜单')}</button><button type="button" onClick={()=>{setTab('dyod');setTimeout(()=>document.getElementById('dyod')?.scrollIntoView({behavior:'smooth',block:'start'}),80);}}>DYOD</button></nav>
<section className="welcome"><div className="eyebrow">{t('WELCOME TO ACE BAR','欢迎来到 ACE BAR')}</div><h1>{t('Good drinks,','美酒相聚，')}<em>{t('good company.','好友相伴。')}</em></h1><p>{t('Explore what we can make today and send your order straight to the home bar.','看看今天可以为你调制哪些酒，选好后直接发送给家庭吧台。')}</p></section>
    <section className="guest-name-bar"><label>{t('Your name or nickname','你的姓名 / 昵称')}<input value={guestName} onChange={e=>setGuestName(e.target.value)} onBlur={()=>{if(guestName.trim())localStorage.setItem('ace-bar-guest-name',guestName.trim());}} placeholder={t('e.g. Alex','例如：Alex')} maxLength={40}/></label><small>{t('We’ll show this name with your orders.','后台会用这个名字识别你的订单。')}</small></section>
    <nav className="tabs"><button className={tab==='menu'?'active':''} onClick={()=>setTab('menu')}><Wine size={17}/>{t('Cocktails','鸡尾酒')}</button><button className={tab==='dyod'?'active':''} onClick={()=>setTab('dyod')}>✨ DYOD</button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}><ClipboardList size={17}/>{t('My orders','我的订单')}{orders.length>0&&<span className="dot">{orders.length}</span>}</button></nav>
    {tab==='dyod' ? <DYODPanel supabase={supabase} lang={lang} onOrder={submitDyodOrder}/> : tab==='menu' ? <><div className="sectionhead" id="menu"><div><div className="eyebrow">{t('MIXED TO PERFECTION','匠心调制')}</div><h2>{t('Cocktail menu','鸡尾酒菜单')}</h2></div><span className="muted">{t('Made for sharing','好友共享')}</span></div><div className="menu">{menu.map(x=><article className="item cocktail-item" key={x.id} role="button" tabIndex={0} onClick={()=>setSelectedCocktail(x)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedCocktail(x);}}}><img className="cocktail-thumb" src={x.image} alt={x.name} /><div className="iteminfo"><h3>{t(x.name,x.zh)}</h3><p>{t(x.desc,x.zhDesc)}</p><b>{t('Made with care','用心调制')}</b><small className="photo-hint">{t('Tap to view photo','点击查看大图')}</small></div><div className="quantity" onClick={e=>e.stopPropagation()}>{cart[x.id]?<><button onClick={()=>remove(x.id)}><Minus size={15}/></button><strong>{cart[x.id]}</strong><button onClick={()=>add(x.id)}><Plus size={15}/></button></>:<button className="add" onClick={()=>add(x.id)}><Plus size={17}/></button>}</div></article>)}</div>{selectedCocktail&&<div className="cocktail-lightbox" role="presentation" onClick={()=>setSelectedCocktail(null)}><div className="cocktail-lightbox-card" role="dialog" aria-modal="true" aria-label={selectedCocktail.name} onClick={e=>e.stopPropagation()}><button className="cocktail-lightbox-close" onClick={()=>setSelectedCocktail(null)} aria-label={t('Close','关闭')}>×</button><img src={selectedCocktail.image} alt={selectedCocktail.name}/><div className="cocktail-lightbox-info"><h2>{t(selectedCocktail.name,selectedCocktail.zh)}</h2><p>{t(selectedCocktail.desc,selectedCocktail.zhDesc)}</p><b>{t('Made with care','用心调制')}</b></div></div></div>}{count>0&&<div className="checkout"><div><small>{t('YOUR ORDER','您的订单')}</small><strong>{count} {t('drinks','杯鸡尾酒')} · {t('Complimentary','免费招待')}</strong></div><button disabled={busy} onClick={submit}>{busy?t('Sending…','提交中…'):t('Place order','提交订单')}<span>→</span></button></div>}</> : <><div className="sectionhead"><div><div className="eyebrow">{t('AT YOUR PACE','随时查看')}</div><h2>{t('My orders','我的订单')}</h2></div></div>{sent&&<div className="success"><CheckCircle2 size={19}/>{notice}</div>}{orders.length===0?<div className="empty"><ShoppingBag size={30}/><h3>{t('No demo orders yet','暂无本机演示订单')}</h3><p>{t('Submitted demo orders on this device show up here.','本设备提交的演示订单会显示在这里。')}</p><button onClick={()=>setTab('menu')}>{t('Browse cocktails','浏览鸡尾酒')}</button></div>:orders.map(o=><article className="ordercard" key={o.id}><div className="orderhead"><b>{o.guest_name || guestName || 'ACE BAR'} · #{String(o.id).slice(-5)}</b><span><Clock3 size={14}/>{statusLabel(o.status)}</span></div>{o.items.map((l,i)=><p key={i}>{l.qty} × {t(l.name,l.zh)}</p>)}<strong>{t('Complimentary','免费招待')}</strong>{o.trackingToken&&<div className="trackinghint">{t('Order status updates automatically every few seconds.','订单状态每几秒自动更新。')}</div>}</article>)}</>}
    {notice&&!sent&&<div className="notice">{notice}</div>}
    <footer>{t('Please enjoy responsibly.','请理性饮酒。')}<br/>© ACE BAR</footer></main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
