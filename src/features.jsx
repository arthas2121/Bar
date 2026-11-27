import React, { useEffect, useState } from 'react';

export function ReservationPanel({supabase, lang='en'}) {
  const zh=lang==='zh';
  const [form,setForm]=useState({name:'',contact:'',date:'',time:'',party:'2',notes:''});
  const [message,setMessage]=useState('');
  const submit=async e=>{
    e.preventDefault();
    if(!supabase){setMessage(zh?'预约服务暂不可用':'Reservations are unavailable right now.');return;}
    const {error}=await supabase.from('bar_reservations').insert({
      guest_name:form.name,contact:form.contact,reservation_date:form.date,
      reservation_time:form.time,party_size:Number(form.party),notes:form.notes
    });
    setMessage(error?error.message:(zh?'预约申请已发送，我们会与你确认。':'Request sent — our team will confirm with you.'));
  };
  return <section className="visit-panel" id="visit">
    <div><div className="eyebrow">{zh?'预约到店':'RESERVATIONS'}</div><h2>{zh?'计划你的到店时光。':'Plan your visit.'}</h2><p>{zh?'提交预约申请，工作人员会与你确认。':'Send a reservation request and our team will confirm the details.'}</p></div>
    <form className="reservation-form" onSubmit={submit}>
      <input placeholder={zh?'姓名':'Your name'} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/>
      <input placeholder={zh?'电话或邮箱':'Phone or email'} value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})} required/>
      <input aria-label="Date" type="date" min={new Date().toISOString().slice(0,10)} value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required/>
      <input aria-label="Time" type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} required/>
      <select value={form.party} onChange={e=>setForm({...form,party:e.target.value})}>{[1,2,3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n} {zh?'位客人':'guests'}</option>)}</select>
      <textarea placeholder={zh?'备注（选填）':'Notes (optional)'} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
      <button>{zh?'提交预约申请':'Request a reservation'} ↗</button>{message&&<p className="form-message">{message}</p>}
    </form>
  </section>;
}

export function DYODPanel({supabase,lang='en'}) {
  const zh=lang==='zh';
  const [answers,setAnswers]=useState({mood:'Adventurous',mbti:'',zodiac:'',taste:'Balanced',strength:'Medium'});
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const update=(key,value)=>setAnswers(a=>({...a,[key]:value}));
  const create=async()=>{
    setBusy(true);setError('');setResult(null);
    if(!supabase){setError(zh?'暂时无法连接酒库。':'Could not connect to the bar inventory.');setBusy(false);return;}
    const {data,error:fnError}=await supabase.functions.invoke('generate-dyod',{body:{answers}});
    if(fnError||!data?.recipe){setError(data?.error || (zh?'AI 调酒师暂时不可用，请检查服务配置后重试。':'The AI bartender is unavailable. Please check its configuration and try again.'));setBusy(false);return;}
    setResult({...data.recipe,inventoryCount:data.inventory_count});setBusy(false);
  };
  const translations={'Adventurous':'喜欢尝鲜、爱冒险','Romantic':'浪漫、感性','Playful':'活泼、有趣','Calm':'平静、放松','Mysterious':'神秘、深沉','Celebratory':'开心、庆祝时刻','I prefer not to say':'不想透露','Prefer not to say':'不想透露','Aries':'白羊座','Taurus':'金牛座','Gemini':'双子座','Cancer':'巨蟹座','Leo':'狮子座','Virgo':'处女座','Libra':'天秤座','Scorpio':'天蝎座','Sagittarius':'射手座','Capricorn':'摩羯座','Aquarius':'水瓶座','Pisces':'双鱼座','Sour':'酸爽','Sweet':'偏甜','Bitter':'微苦/苦韵','Balanced':'酸甜苦平衡','Herbal':'草本香气','Smoky':'烟熏风味','Light':'清爽、酒感轻','Medium':'酒感适中','Spirit-forward':'酒味浓郁'};
  const fields=[
    ['mood',zh?'今晚的心情':'Your mood',['Adventurous','Romantic','Playful','Calm','Mysterious','Celebratory']],
    ['mbti','MBTI（性格类型）',['I prefer not to say','INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP']],
    ['zodiac',zh?'你的星座':'Zodiac sign',['Prefer not to say','Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']],
    ['taste',zh?'你喜欢的味道':'Flavour preference',['Sour','Sweet','Bitter','Balanced','Herbal','Smoky']],
    ['strength',zh?'你喜欢的酒感':'Strength',['Light','Medium','Spirit-forward']]
  ];
  return <section className="dyod-section" id="dyod"><div className="eyebrow">{zh?'专属于你的风味创作':'A LITTLE YOU, A LITTLE MAGIC'}</div><h2>{zh?'设计你的专属鸡尾酒':'Design Your Own Drink'}</h2><p>{zh?'回答几个关于心情与口味的问题，让 AI 为你创作一杯独一无二的鸡尾酒。':'Tell us your mood and flavour preferences. Our AI mixologist will create a cocktail just for you.'}</p>
    <div className="dyod-grid">{fields.map(([key,label,options])=><label key={key}>{label}<select value={answers[key]} onChange={e=>update(key,e.target.value)}>{options.map(v=><option key={v} value={v}>{zh?(translations[v]||v):v}</option>)}</select></label>)}</div>
    <button className="dyod-generate" onClick={create} disabled={busy}>{busy?(zh?'创作中…':'Creating…'):(zh?'生成我的专属鸡尾酒':'Create my cocktail')} ✨</button>
    {error&&<p className="form-message">{error}</p>}
    {result&&<article className="dyod-result"><div className="eyebrow">{zh?'专属创作 · ACE BAR':'MADE JUST FOR YOU · ACE BAR'}</div><h3>{result.name}</h3><p>{result.story}</p><h4>{zh?'配方材料':'Ingredients'}</h4><ul>{(result.ingredients||[]).map((i,n)=><li key={n}>{i.amount} {i.name}</li>)}</ul><h4>{zh?'制作方法':'Method'}</h4><p>{result.method}</p><small>{zh?'请将配方展示给调酒师，实际供应情况以吧台为准。':'Show this recipe to your bartender. Final availability is confirmed at the bar.'}</small></article>}
    <p className="dyod-footnote">{zh?'每次创作都会实时读取后台全部有货原料，并从中挑选合适搭配。':'Every creation reads the full, latest available inventory and selects a compatible combination.'}</p>
  </section>;
}

const categoryNames = {
  'Base spirit':'基酒','Liqueur':'利口酒','Vermouth / Aperitif':'味美思／开胃酒',
  'Bitters':'苦精','Syrup / Sweetener':'糖浆／甜味剂','Juice / Mixer':'果汁／调饮',
  'Tea / Infusion':'茶／浸泡材料','Garnish':'装饰配料','Other':'其他'
};

export function InventoryPanel({supabase}) {
  const [items,setItems]=useState([]);
  const [form,setForm]=useState({name:'',category:'Base spirit',notes:''});
  const [message,setMessage]=useState('');
  const load=async()=>{const {data,error}=await supabase.from('bar_ingredients').select('*').order('name');if(!error)setItems(data||[]);else setMessage(error.message);};
  useEffect(()=>{if(supabase)load();},[supabase]);
  const add=async e=>{e.preventDefault();const {error}=await supabase.from('bar_ingredients').insert({...form,is_available:true});if(error)setMessage(error.message);else{setForm({name:'',category:'Base spirit',notes:''});setMessage('原料已添加。');load();}};
  const toggle=async item=>{const {error}=await supabase.from('bar_ingredients').update({is_available:!item.is_available}).eq('id',item.id);if(error)setMessage(error.message);else load();};
  const remove=async id=>{if(!window.confirm('确定删除这项原料吗？'))return;const {error}=await supabase.from('bar_ingredients').delete().eq('id',id);if(error)setMessage(error.message);else{setMessage('原料已删除。');load();}};
  return <section className="inventory-panel"><div className="eyebrow">DYOD · 酒吧库存</div><h2>原料库存管理</h2><p>添加酒吧现有的基酒、利口酒、调味材料、果汁和装饰配料。DYOD 只会使用标记为有货的原料。</p>
    <form className="ingredient-form" onSubmit={add}><input placeholder="原料名称" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{Object.entries(categoryNames).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select><input placeholder="品牌或风味备注（选填）" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><button>添加原料</button></form>
    {message&&<p className="form-message">{message}</p>}
    <div className="inventory-list">{items.map(item=><div className="inventory-row" key={item.id}><span><b>{item.name}</b><small>{categoryNames[item.category]||item.category}{item.notes?' · '+item.notes:''}</small></span><button onClick={()=>toggle(item)}>{item.is_available?'标记为缺货':'标记为有货'}</button><button onClick={()=>remove(item.id)}>删除</button></div>)}</div>
  </section>;
}

export function ReservationsAdmin({supabase}) {
  const [rows,setRows]=useState([]);
  const [message,setMessage]=useState('');
  const load=async()=>{const {data,error}=await supabase.from('bar_reservations').select('*').order('created_at',{ascending:false});if(error)setMessage(error.message);else setRows(data||[]);};
  useEffect(()=>{if(supabase)load();},[supabase]);
  const update=async(id,status)=>{const {error}=await supabase.from('bar_reservations').update({status}).eq('id',id);if(error)setMessage(error.message);else load();};
  const statusText=s=>({pending:'待处理',confirmed:'已确认',declined:'已婉拒'})[s]||s;
  return <section className="inventory-panel"><div className="eyebrow">顾客预约</div><h2>预约申请管理</h2>{message&&<p>{message}</p>}{rows.length===0?<p>目前还没有预约申请。</p>:rows.map(r=><article className="ordercard" key={r.id}><div className="orderhead"><b>{r.guest_name} · {r.party_size} 位客人</b><span>{statusText(r.status)}</span></div><p>{r.reservation_date} {String(r.reservation_time).slice(0,5)} · {r.contact}</p>{r.notes&&<p>备注：{r.notes}</p>}<div className="statusactions"><button onClick={()=>update(r.id,'confirmed')}>确认预约</button><button onClick={()=>update(r.id,'declined')}>婉拒预约</button></div></article>)}</section>;
}
