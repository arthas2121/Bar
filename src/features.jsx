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
  const [ingredients,setIngredients]=useState([]);
  const [answers,setAnswers]=useState({mood:'Adventurous',mbti:'',zodiac:'',taste:'Balanced',strength:'Medium'});
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{if(supabase)supabase.from('bar_ingredients').select('name,category,notes').eq('is_available',true).then(({data})=>setIngredients(data||[]));},[supabase]);
  const update=(key,value)=>setAnswers(a=>({...a,[key]:value}));
  const create=async()=>{
    setBusy(true);setError('');setResult(null);
    if(!supabase){setError(zh?'暂时无法连接酒库。':'Could not connect to the bar inventory.');setBusy(false);return;}
    const {data,error:fnError}=await supabase.functions.invoke('generate-dyod',{body:{answers,ingredients}});
    if(fnError||!data?.recipe){setError(zh?'AI 调酒师暂时不可用，请稍后再试。':'The AI mixologist is not configured yet. Please try again later.');setBusy(false);return;}
    setResult(data.recipe);setBusy(false);
  };
  const fields=[
    ['mood',zh?'今晚的心情':'Your mood',['Adventurous','Romantic','Playful','Calm','Mysterious','Celebratory']],
    ['mbti','MBTI',['I prefer not to say','INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP']],
    ['zodiac',zh?'星座':'Zodiac sign',['Prefer not to say','Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']],
    ['taste',zh?'最喜欢的味道':'Flavour preference',['Sour','Sweet','Bitter','Balanced','Herbal','Smoky']],
    ['strength',zh?'酒感偏好':'Strength',['Light','Medium','Spirit-forward']]
  ];
  return <section className="dyod-section" id="dyod"><div className="eyebrow">A LITTLE YOU, A LITTLE MAGIC</div><h2>Design Your Own Drink</h2><p>{zh?'回答几个关于心情与口味的问题，让 AI 为你创作一杯独一无二的鸡尾酒。':'Tell us your mood and flavour preferences. Our AI mixologist will create a cocktail just for you.'}</p>
    <div className="dyod-grid">{fields.map(([key,label,options])=><label key={key}>{label}<select value={answers[key]} onChange={e=>update(key,e.target.value)}>{options.map(v=><option key={v} value={v}>{v}</option>)}</select></label>)}</div>
    <button className="dyod-generate" onClick={create} disabled={busy}>{busy?(zh?'创作中…':'Creating…'):(zh?'生成我的专属鸡尾酒':'Create my cocktail')} ✨</button>
    {error&&<p className="form-message">{error}</p>}
    {result&&<article className="dyod-result"><div className="eyebrow">MADE JUST FOR YOU</div><h3>{result.name}</h3><p>{result.story}</p><h4>{zh?'配方材料':'Ingredients'}</h4><ul>{(result.ingredients||[]).map((i,n)=><li key={n}>{i.amount} {i.name}</li>)}</ul><h4>{zh?'制作方法':'Method'}</h4><p>{result.method}</p><small>{zh?'请将配方展示给调酒师，实际供应情况以吧台为准。':'Show this recipe to your bartender. Final availability is confirmed at the bar.'}</small></article>}
    <p className="dyod-footnote">{zh?'仅使用酒吧后台登记为可用的材料进行创作。':'Recipes are generated only from ingredients currently marked available in the bar inventory.'}</p>
  </section>;
}

export function InventoryPanel({supabase}) {
  const [items,setItems]=useState([]);
  const [form,setForm]=useState({name:'',category:'Base spirit',notes:''});
  const [message,setMessage]=useState('');
  const load=async()=>{const {data,error}=await supabase.from('bar_ingredients').select('*').order('name');if(!error)setItems(data||[]);else setMessage(error.message);};
  useEffect(()=>{if(supabase)load();},[supabase]);
  const add=async e=>{e.preventDefault();const {error}=await supabase.from('bar_ingredients').insert({...form,is_available:true});if(error)setMessage(error.message);else{setForm({name:'',category:'Base spirit',notes:''});setMessage('Ingredient added.');load();}};
  const toggle=async item=>{const {error}=await supabase.from('bar_ingredients').update({is_available:!item.is_available}).eq('id',item.id);if(error)setMessage(error.message);else load();};
  const remove=async id=>{const {error}=await supabase.from('bar_ingredients').delete().eq('id',id);if(error)setMessage(error.message);else load();};
  return <section className="inventory-panel"><div className="eyebrow">DYOD · YOUR BAR STOCK</div><h2>Ingredient inventory</h2><p>Add every spirit, liqueur, modifier, mixer and garnish. DYOD can only use available items.</p>
    <form className="ingredient-form" onSubmit={add}><input placeholder="Ingredient name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{['Base spirit','Liqueur','Vermouth / Aperitif','Bitters','Syrup / Sweetener','Juice / Mixer','Tea / Infusion','Garnish','Other'].map(v=><option key={v}>{v}</option>)}</select><input placeholder="Brand or tasting notes (optional)" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><button>Add ingredient</button></form>
    {message&&<p className="form-message">{message}</p>}
    <div className="inventory-list">{items.map(item=><div className="inventory-row" key={item.id}><span><b>{item.name}</b><small>{item.category}{item.notes?' · '+item.notes:''}</small></span><button onClick={()=>toggle(item)}>{item.is_available?'Mark out of stock':'Mark available'}</button><button onClick={()=>remove(item.id)}>Delete</button></div>)}</div>
  </section>;
}
