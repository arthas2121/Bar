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

export function DYODPanel({supabase,lang='en',onOrder}) {
  const zh=lang==='zh';
  const [answers,setAnswers]=useState({mood:'Adventurous',mbti:'',zodiac:'',taste:'Balanced',strength:'Medium'});
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [recipeLang,setRecipeLang]=useState(lang);
  const [artVariant,setArtVariant]=useState(0);
  const barBackdrops=['https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1400&q=85','https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1400&q=85','https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1400&q=85','https://images.unsplash.com/photo-1516997121675-4c2d1684aa3e?auto=format&fit=crop&w=1400&q=85'];
  const recipeText=(en,zh)=>recipeLang==='zh'?(zh||en||''):(en||zh||'');
  const recipeField=(key)=>recipeText(result?.[key+'_en'],result?.[key+'_zh']);
  const update=(key,value)=>setAnswers(a=>({...a,[key]:value}));
  const create=async()=>{
    setBusy(true);setError('');setResult(null);
    try {
      if(!supabase) throw new Error(zh?'暂时无法连接酒库。':'Could not connect to the bar inventory.');
      const {data,error:fnError}=await supabase.functions.invoke('generate-dyod',{body:{answers}});
      if(fnError) {
        let detail='';
        try {
          const payload=await fnError.context?.json();
          detail=payload?.error || payload?.message || '';
          if(payload?.status) detail += (detail?' ':'') + '(HTTP '+payload.status+')';
          if(payload?.code) detail += (detail?' ':'') + '('+payload.code+')';
        } catch {}
        throw new Error(detail || fnError.message || (zh?'AI 服务请求失败，请稍后重试。':'The AI request failed. Please try again.'));
      }
      if(!data?.recipe) throw new Error(data?.error || (zh?'AI 没有返回配方，请检查库存和服务配置。':'The AI returned no recipe. Please check inventory and function settings.'));
      setResult({...data.recipe,inventoryCount:data.inventory_count});
      setArtVariant(Math.floor(Math.random()*barBackdrops.length));
      setRecipeLang(lang);
    } catch(err) {
      console.error('DYOD generation failed:',err);
      setError(err?.message || (zh?'生成失败，请稍后重试。':'Generation failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };
  const recipeVisual = (() => {
    const ingredients=(result?.ingredients||[]).map(i=>[i.name,i.name_en,i.name_zh].filter(Boolean).join(' ').toLowerCase()).join(' ');
    const glass=String(result?.glassware_en||result?.glassware||result?.glassware_zh||'').toLowerCase();
    const all=ingredients+' '+String(result?.name_en||result?.name||'').toLowerCase();
    const palette=[
      {keys:['coffee','espresso','cacao','chocolate','cola','black tea','乌龙','红茶','咖啡','可可'],color:'#80513b',glow:'#c38a55'},
      {keys:['hibiscus','cranberry','raspberry','strawberry','pomegranate','cherry','grapefruit','洛神','蔓越莓','覆盆子','草莓','石榴','樱桃','西柚'],color:'#ad4554',glow:'#e58a79'},
      {keys:['blue curaçao','blue curacao','butterfly pea','蓝柑','蝶豆花'],color:'#477eae',glow:'#8ec7dc'},
      {keys:['matcha','mint','basil','cucumber','melon','抹茶','薄荷','罗勒','黄瓜','蜜瓜'],color:'#77945b',glow:'#b6c98a'},
      {keys:['lemon','lime','yuzu','pineapple','apple','pear','gin','pisco','baobab','柠檬','青柠','柚子','菠萝','苹果','梨','金酒','皮斯科'],color:'#c6a64e',glow:'#f0d98a'},
      {keys:['orange','peach','mango','apricot','passion fruit','osmanthus','橙','桃','芒果','杏','百香果','桂花'],color:'#c47d3d',glow:'#edbd70'}
    ];
    const chosen=palette.find(p=>p.keys.some(k=>all.includes(k)))||{color:'#a77b50',glow:'#e2c08a'};
    const garnish=all.includes('olive')||all.includes('橄榄')?'olive':all.includes('cherry')||all.includes('樱桃')?'cherry':all.includes('rosemary')||all.includes('thyme')||all.includes('basil')||all.includes('mint')||all.includes('迷迭香')||all.includes('百里香')||all.includes('罗勒')||all.includes('薄荷')?'herb':all.includes('grapefruit')||all.includes('pomelo')||all.includes('西柚')||all.includes('柚')?'grapefruit':all.includes('lemon')||all.includes('lime')||all.includes('柠檬')||all.includes('青柠')?'citrus':all.includes('orange')||all.includes('橙')||all.includes('osmanthus')||all.includes('桂花')?'orange':'citrus';
    const shape=/martini|coupe|nick\s*&?\s*nora|cocktail glass|尼克|笛形/.test(glass)?'coupe':/highball|collins|long drink|长饮/.test(glass)?'highball':/rocks|old fashioned|tumbler|lowball|古典/.test(glass)?'rocks':'stem';
    const ice=/crushed|碎冰|pebble/.test(all)?'crushed':/large cube|king cube|大冰块|方冰/.test(all+' '+glass)?'large':shape==='rocks'?'large':shape==='highball'?'spear':'none';
    const rim=/salt|盐口/.test(all)?'salt':/sugar|糖边/.test(all)?'sugar':'none';
    return {...chosen,garnish,shape,ice,rim};
  })();
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
    {result&&<article className="dyod-result">
      <div className="eyebrow">{zh?'专属创作 · ACE BAR':'MADE JUST FOR YOU · ACE BAR'}</div>
      <div className="dyod-language"><button type="button" className={recipeLang==='en'?'active':''} onClick={()=>setRecipeLang('en')}>English</button><button type="button" className={recipeLang==='zh'?'active':''} onClick={()=>setRecipeLang('zh')}>中文</button></div>
      <div className="dyod-card-art" style={{backgroundImage:`linear-gradient(180deg, rgba(7,18,12,.22), rgba(7,18,12,.58)), radial-gradient(ellipse at 50% 48%, ${recipeVisual.glow}66, transparent 48%), url("${barBackdrops[artVariant]}")`,backgroundSize:"cover",backgroundPosition:"center"}}>
        {result.image_url?<img className="dyod-drink-image" src={result.image_url} alt={recipeText(result.name_en||result.name,result.name_zh)}/>:<div className="dyod-glass-art" style={{'--dyod-liquid':recipeVisual.color,'--dyod-glow':recipeVisual.glow,transform:`translateY(${artVariant%2?-5:5}px) rotate(${artVariant%2?-3:3}deg) scale(${artVariant>1?1.06:1})`}} data-glass={recipeVisual.shape} data-garnish={recipeVisual.garnish} aria-label={recipeLang==='zh'?'根据配方生成的酒杯与装饰插画':'Recipe-inspired cocktail glass illustration'}><span className="dyod-art-orbit orbit-one"/><span className="dyod-art-orbit orbit-two"/><svg viewBox="0 0 240 220" role="img" aria-hidden="true"><defs><linearGradient id="dyodLiquid" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--dyod-glow)"/><stop offset="1" stopColor="var(--dyod-liquid)"/></linearGradient></defs>{recipeVisual.shape==='coupe'?<><path d="M38 42h164Q190 111 120 119 50 111 38 42Z" fill="rgba(255,255,255,.08)" stroke="#e6c58b" strokeWidth="3"/><path d="M49 54h142q-17 53-71 58-54-5-71-58Z" fill="url(#dyodLiquid)" opacity=".92"/><path d="M120 119v67m-35 0h70" stroke="#e6c58b" strokeWidth="4" strokeLinecap="round"/></>:recipeVisual.shape==='highball'?<><path d="M72 28h96l-10 142H82L72 28Z" fill="rgba(255,255,255,.08)" stroke="#e6c58b" strokeWidth="3"/><path d="M78 73h84l-7 90H85l-7-90Z" fill="url(#dyodLiquid)"/><path d="M120 170v20m-30 0h60" stroke="#e6c58b" strokeWidth="4" strokeLinecap="round"/></>:recipeVisual.shape==='rocks'?<><path d="M57 52h126l-10 111q-53 18-106 0L57 52Z" fill="rgba(255,255,255,.08)" stroke="#e6c58b" strokeWidth="3"/><path d="M64 91h112l-7 66q-49 15-98 0L64 91Z" fill="url(#dyodLiquid)"/><path d="M120 164v25m-30 0h60" stroke="#e6c58b" strokeWidth="4" strokeLinecap="round"/></>:<><path d="M62 35h116l-16 93a42 42 0 0 1-84 0L62 35Z" fill="rgba(255,255,255,.08)" stroke="#e6c58b" strokeWidth="3"/><path d="M70 72h100l-8 50a42 42 0 0 1-84 0L70 72Z" fill="url(#dyodLiquid)"/><path d="M120 170v25m-32 0h64" stroke="#e6c58b" strokeWidth="4" strokeLinecap="round"/></>}{recipeVisual.garnish==='olive'?<g><ellipse cx="170" cy="44" rx="17" ry="11" transform="rotate(-24 170 44)" fill="#71834d" stroke="#d6c28e" strokeWidth="3"/><circle cx="170" cy="44" r="4" fill="#493a29"/><path d="M154 37l-9-13" stroke="#d6c28e" strokeWidth="2"/></g>:recipeVisual.garnish==='cherry'?<g><circle cx="160" cy="45" r="12" fill="#a93645" stroke="#efb0a2" strokeWidth="2"/><circle cx="179" cy="51" r="10" fill="#842b3c"/><path d="M160 34q-4-24 16-25M179 41q-1-25-3-32" fill="none" stroke="#91a77b" strokeWidth="3"/></g>:recipeVisual.garnish==='herb'?<g><path d="M157 54q-27-29-40-7 16 21 40 7Zm0 0q9-34 31-23-2 27-31 23Zm-2-3q-2-28 12-36" fill="#91a77b" stroke="#d5c48d" strokeWidth="2"/><path d="M144 45l13 9 19-18" stroke="#d5e0b4" strokeWidth="1.5" fill="none"/></g>:<g><circle cx="169" cy="44" r="20" fill={recipeVisual.garnish==='grapefruit'?'#d77c70':'#d9a64f'} stroke="#f1d99c" strokeWidth="3"/><circle cx="169" cy="44" r="15" fill="none" stroke="#fff0c7" strokeWidth="2"/><path d="M169 25v38m-19-19h38m-32-13 26 26m0-26-26 26" stroke="#fff0c7" strokeWidth="1.5"/></g>}{recipeVisual.ice==='large'?<g transform="translate(0 0)"><path d="M91 104l16-8 17 9-2 24-18 7-15-12Z" fill="#e5f2ed" fillOpacity=".72" stroke="#fff" strokeWidth="2"/><path d="M126 119l13-7 14 8-2 20-16 6-12-10Z" fill="#d9eee9" fillOpacity=".58" stroke="#fff" strokeWidth="2"/></g>:recipeVisual.ice==='crushed'?<g fill="#e8f3ed" fillOpacity=".75"><path d="M88 105l12-7 9 10-8 12Z"/><path d="M115 117l9-8 10 9-7 11Z"/><path d="M143 103l10-5 8 11-11 8Z"/><path d="M100 139l10-7 8 10-11 8Z"/></g>:recipeVisual.ice==='spear'?<path d="M101 80l10-5 12 9-3 54-12 6-10-9Z" fill="#e8f3ed" fillOpacity=".58" stroke="#fff" strokeWidth="2"/>:null}{recipeVisual.rim!=='none'?<path d="M43 43q77 15 154 0" fill="none" stroke={recipeVisual.rim==='salt'?'#f4f0dc':'#dfc27e'} strokeWidth="5" strokeDasharray="2 5"/>:null}</svg></div>}
      </div>
      <div className="dyod-card-copy"><div className="dyod-card-kicker">{recipeLang==='zh'?'为你调制 · 独一无二':'PERSONALIZED MIXOLOGY'}</div>
      <h3>{recipeText(result.name_en||result.name,result.name_zh)}</h3><p className="dyod-story">{recipeText(result.description_en||result.story_en||result.description||result.story,result.description_zh||result.story_zh)}</p>
      {(result.flavour_en||result.flavour_zh||result.aroma_en||result.aroma_zh)&&<div className="dyod-tags"><span>{recipeField('flavour')}</span><span>{recipeField('aroma')}</span></div>}
      <div className="dyod-recipe-block"><h4>{recipeLang==='zh'?'配方材料':'INGREDIENTS'}</h4><ul>{(result.ingredients||[]).map((i,n)=><li key={n}><span>{recipeText(i.name_en||i.name,i.name_zh||i.name)}</span><b>{i.amount}</b></li>)}</ul></div>
      <div className="dyod-recipe-block"><h4>{recipeLang==='zh'?'制作方法':'THE METHOD'}</h4><p>{recipeText(result.method_en||result.method,result.method_zh||result.method)}</p>{(result.glassware_en||result.glassware)&&<p className="dyod-glassware"><b>{recipeLang==='zh'?'建议杯型':'SERVE IN'}:</b> {recipeText(result.glassware_en||result.glassware,result.glassware_zh)}</p>}{(result.garnish_en||result.garnish_zh)&&<p><b>{recipeLang==='zh'?'装饰':'GARNISH'}:</b> {recipeField('garnish')}</p>}{(result.occasion_en||result.occasion_zh)&&<p><b>{recipeLang==='zh'?'适合场景':'BEST ENJOYED'}:</b> {recipeField('occasion')}</p>}</div>
      <small>{recipeLang==='zh'?'把这份配方展示给家庭吧台主人。':'Show this recipe to your home-bar host.'}</small>
      <button type="button" className="dyod-order" onClick={()=>onOrder?.({...result,display_language:recipeLang})}>{recipeLang==='zh'?'点这杯酒':'Order this drink'} →</button></div>
    </article>}
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
