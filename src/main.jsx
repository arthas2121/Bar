import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShoppingBag, Plus, Minus, ClipboardList, Wine, CheckCircle2, Clock3, ChefHat, Languages, X } from 'lucide-react';
import './style.css';

const menu = [
  { id: 1, category: 'Cocktails', name: 'Old Fashioned', zh: '古典鸡尾酒', desc: 'Bourbon, bitters, sugar, orange', zhDesc: '波本威士忌、苦精、糖与橙皮', price: 14, emoji: '🥃' },
  { id: 2, category: 'Cocktails', name: 'Margarita', zh: '玛格丽特', desc: 'Tequila, lime, orange liqueur', zhDesc: '龙舌兰、青柠与橙味利口酒', price: 13, emoji: '🍸' },
  { id: 3, category: 'Cocktails', name: 'Espresso Martini', zh: '浓缩咖啡马天尼', desc: 'Vodka, espresso, coffee liqueur', zhDesc: '伏特加、浓缩咖啡与咖啡利口酒', price: 15, emoji: '☕' },
  { id: 4, category: 'Beer', name: 'Draft Lager', zh: '生啤拉格', desc: 'Crisp, light, refreshing · 16 oz', zhDesc: '清爽易饮 · 16盎司', price: 7, emoji: '🍺' },
  { id: 5, category: 'Beer', name: 'IPA', zh: '印度淡色艾尔', desc: 'Hoppy craft beer · 16 oz', zhDesc: '酒花香型精酿啤酒 · 16盎司', price: 8, emoji: '🍻' },
  { id: 6, category: 'Wine', name: 'House Red', zh: '店选红葡萄酒', desc: 'Smooth and balanced · Glass', zhDesc: '口感柔和均衡 · 单杯', price: 12, emoji: '🍷' },
  { id: 7, category: 'Wine', name: 'House White', zh: '店选白葡萄酒', desc: 'Fresh and bright · Glass', zhDesc: '清新明亮 · 单杯', price: 12, emoji: '🥂' },
  { id: 8, category: 'Zero Proof', name: 'Citrus Spritz', zh: '柑橘气泡饮', desc: 'Orange, lemon, sparkling water', zhDesc: '橙子、柠檬与苏打水', price: 8, emoji: '🍊' }
];
const categories = ['All', 'Cocktails', 'Beer', 'Wine', 'Zero Proof'];
function App() {
  const [lang, setLang] = useState('en');
  const [tab, setTab] = useState('menu');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState({});
  const [orders, setOrders] = useState([]);
  const [sent, setSent] = useState(false);
  const table = new URLSearchParams(location.search).get('table') || '12';
  const t = (en, zh) => lang === 'en' ? en : zh;
  const items = useMemo(() => menu.filter(x => category === 'All' || x.category === category), [category]);
  const count = Object.values(cart).reduce((a,b) => a+b, 0);
  const total = menu.reduce((sum, x) => sum + x.price * (cart[x.id] || 0), 0);
  const add = id => setCart(c => ({...c, [id]: (c[id] || 0) + 1}));
  const remove = id => setCart(c => { const n = {...c}; if ((n[id] || 0) <= 1) delete n[id]; else n[id]--; return n; });
  const submit = () => {
    if (!count) return;
    setOrders(o => [{ id: Date.now(), table, lines: menu.filter(x => cart[x.id]).map(x => ({...x, qty: cart[x.id]})), total, status: 'Received' }, ...o]);
    setCart({}); setSent(true); setTab('orders');
  };
  const statusText = s => ({Received:t('Received','已收到'), Preparing:t('Preparing','制作中'), Ready:t('Ready','已完成')})[s];
  return <div className="app">
    <header className="top"><div className="brand"><div className="brandmark"><Wine size={21}/></div><div><b>THE POUR HOUSE</b><small>{t('GOOD DRINKS. GOOD COMPANY.','好酒相伴，美好时光。')}</small></div></div><button className="lang" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}><Languages size={17}/>{lang === 'en' ? '中文' : 'English'}</button></header>
    <main><section className="welcome"><div className="eyebrow">{t('WELCOME IN','欢迎光临')}</div><h1>{t('Your table,','您的餐桌，')}<em>{t('your order.','您的点单。')}</em></h1><p>{t('Explore the menu and order when you’re ready.','浏览菜单，准备好后即可下单。')}</p><div className="tabletag">{t('TABLE','桌号')} <strong>#{table}</strong></div></section>
    <nav className="tabs"><button className={tab==='menu'?'active':''} onClick={()=>setTab('menu')}><Wine size={17}/>{t('Menu','菜单')}</button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}><ClipboardList size={17}/>{t('My orders','我的订单')}{orders.length>0&&<span className="dot">{orders.length}</span>}</button></nav>
    {tab==='menu' ? <><div className="sectionhead"><div><div className="eyebrow">{t('MADE FOR YOU','为您精选')}</div><h2>{t('The menu','酒水菜单')}</h2></div><span className="muted">{t('Prices in USD','美元计价')}</span></div><div className="filters">{categories.map(c=><button key={c} className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c==='All'?t('All','全部'):c==='Cocktails'?t('Cocktails','鸡尾酒'):c==='Beer'?t('Beer','啤酒'):c==='Wine'?t('Wine','葡萄酒'):t('Zero Proof','无酒精')}</button>)}</div><div className="menu">{items.map(x=><article className="item" key={x.id}><div className="drinkicon">{x.emoji}</div><div className="iteminfo"><h3>{t(x.name,x.zh)}</h3><p>{t(x.desc,x.zhDesc)}</p><b>${x.price.toFixed(2)}</b></div><div className="quantity">{cart[x.id]?<><button onClick={()=>remove(x.id)}><Minus size={15}/></button><strong>{cart[x.id]}</strong><button onClick={()=>add(x.id)}><Plus size={15}/></button></>:<button className="add" onClick={()=>add(x.id)}><Plus size={17}/></button>}</div></article>)}</div>{count>0&&<div className="checkout"><div><small>{t('YOUR ORDER','您的订单')}</small><strong>{count} {t('items','件商品')} · ${total.toFixed(2)}</strong></div><button onClick={submit}>{t('Place order','提交订单')}<span>→</span></button></div>}</> : <><div className="sectionhead"><div><div className="eyebrow">{t('AT YOUR PACE','随时查看')}</div><h2>{t('My orders','我的订单')}</h2></div></div>{sent&&<div className="success"><CheckCircle2 size={19}/>{t('Order sent to the bar! Payment is made at the counter.','订单已发送到吧台！请到吧台付款。')}</div>}{orders.length===0?<div className="empty"><ShoppingBag size={30}/><h3>{t('No orders yet','还没有订单')}</h3><p>{t('Your submitted orders will show up here.','提交的订单会显示在这里。')}</p><button onClick={()=>setTab('menu')}>{t('Browse menu','浏览菜单')}</button></div>:orders.map(o=><article className="ordercard" key={o.id}><div className="orderhead"><b>#{String(o.id).slice(-5)} · {t('Table','桌号')} {o.table}</b><span><Clock3 size={14}/>{statusText(o.status)}</span></div>{o.lines.map(l=><p key={l.id}>{l.qty} × {t(l.name,l.zh)}</p>)}<strong>${o.total.toFixed(2)}</strong></article>)}</>}
    <footer>{t('Please enjoy responsibly. Payment is made at the bar.','请理性饮酒。订单请到吧台付款。')}<br/>© THE POUR HOUSE</footer></main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);