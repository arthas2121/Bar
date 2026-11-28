import React, { useEffect, useState } from 'react';

const GAMES = [
  ['liars_dice','Liar’s Dice','吹牛骰子','骰子心理战'],
  ['high_low','High or Low','大小挑战','掷骰子比点数'],
  ['higher_lower','Higher or Lower','猜牌大小','猜下一张牌更大还是更小'],
  ['red_black','Red or Black','红黑猜牌','猜下一张牌的颜色'],
  ['kings_cup','King’s Cup','国王游戏','抽牌触发派对互动任务'],
  ['dare_or_drink','Dare or Choose','挑战卡','抽取轻松有趣的挑战']
];
const GAME_LABEL = Object.fromEntries(GAMES.map(g=>[g[0],g[1]]));
const GAME_ZH = Object.fromEntries(GAMES.map(g=>[g[0],g[2]]));

export function GameRoom({supabase,lang='en',guestName=''}) {
  const zh=lang==='zh';
  const [name,setName]=useState(guestName);
  const [code,setCode]=useState('');
  const [game,setGame]=useState('liars_dice');
  const [room,setRoom]=useState(null);
  const [players,setPlayers]=useState([]);
  const [rounds,setRounds]=useState([]);
  const [token,setToken]=useState('');
  const [hostToken,setHostToken]=useState('');
  const [playerId,setPlayerId]=useState('');
  const [myDice,setMyDice]=useState([]);
  const [bidCount,setBidCount]=useState(1);
  const [bidFace,setBidFace]=useState(2);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [guess,setGuess]=useState('higher');
  const [maxPlayers,setMaxPlayers]=useState(8);
  const [lobbyRooms,setLobbyRooms]=useState([]);
  const [lastResult,setLastResult]=useState(null);
  const tr=(en,cn)=>zh?cn:en;
  const loadLobby=async()=>{const {data,error}=await supabase.rpc('game_list_waiting_rooms');if(!error)setLobbyRooms(data||[]);};
  const loadRoom=async (id,sessionToken=token)=>{
    const {data,error}=await supabase.rpc('game_get_room',{p_room:id,p_token:sessionToken||null});
    if(error||!data?.room){setMessage(tr('Could not load room. Please refresh.','无法读取房间，请刷新页面。'));return;}
    setRoom(data.room);setPlayers(data.players||[]);setRounds(data.rounds||[]);setPlayerId(data.player_id||'');setMyDice(data.my_dice||[]);
    if(data.room.game_state?.last_result)setLastResult(data.room.game_state.last_result);
  };
  useEffect(()=>{
    loadLobby();
    const lobbyTimer=setInterval(loadLobby,5000);
    let saved=null;try{saved=JSON.parse(localStorage.getItem('ace-game-session')||'null');}catch{localStorage.removeItem('ace-game-session');}
    if(saved?.room_id&&saved?.player_token){setToken(saved.player_token);setHostToken(saved.host_token||'');setPlayerId(saved.player_id||'');loadRoom(saved.room_id,saved.player_token);}
    return()=>clearInterval(lobbyTimer);
  },[]);
  useEffect(()=>{
    if(!room?.id)return;
    const timer=setInterval(()=>{loadRoom(room.id);loadLobby();},3000);
    return()=>clearInterval(timer);
  },[room?.id,token]);
  const saveSession=data=>{
    const s={...data};localStorage.setItem('ace-game-session',JSON.stringify(s));
    setToken(s.player_token||'');setHostToken(s.host_token||'');setPlayerId(s.player_id||'');loadRoom(s.room_id,s.player_token||'');
  };
  const createRoom=async e=>{
    e?.preventDefault();if(!supabase){setMessage(tr('Game service is not connected.','游戏服务尚未连接。'));return;}
    if(!name.trim()){setMessage(tr('Enter your name first.','请先输入昵称。'));return;}
    setBusy(true);const {data,error}=await supabase.rpc('game_create_room',{p_name:name.trim(),p_game:game,p_max:maxPlayers});setBusy(false);
    if(error){setMessage(error.message);return;}saveSession(data);setMessage(tr('Room created. Invite your friends to join!','房间已创建，邀请朋友加入吧！'));
  };
  const joinRoom=async e=>{
    e?.preventDefault();if(!name.trim()||!code.trim()){setMessage(tr('Enter your name and room code.','请输入昵称和房间码。'));return;}
    setBusy(true);const {data,error}=await supabase.rpc('game_join_room',{p_code:code.trim(),p_name:name.trim()});setBusy(false);
    if(error){setMessage(error.message);return;}saveSession(data);setMessage(tr('You joined the room!','已成功加入房间！'));
  };
  const startGame=async()=>{
    setBusy(true);const {error}=await supabase.rpc('game_host_start',{p_room:room.id,p_token:hostToken});setBusy(false);
    setMessage(error?error.message:tr('Game started!','游戏开始！'));loadRoom(room.id);
  };
  const play=async (action,value=guess)=>{
    setBusy(true);const {data,error}=await supabase.rpc('game_play_round',{p_room:room.id,p_token:token,p_action:action,p_guess:value});setBusy(false);
    if(error){setMessage(error.message);return;}setLastResult(data);await loadRoom(room.id,token);
  };
  const finish=async()=>{
    setBusy(true);const {error}=await supabase.rpc('game_host_finish',{p_room:room.id,p_token:hostToken});setBusy(false);
    if(error)setMessage(error.message);loadRoom(room.id);
  };
  const leave=()=>{localStorage.removeItem('ace-game-session');setRoom(null);setPlayers([]);setRounds([]);setToken('');setHostToken('');setPlayerId('');setMyDice([]);setLastResult(null);setMessage('');};
  if(!supabase)return <section className="game-room-panel"><h2>Game Room</h2><p>{tr('Connect Supabase to enable multiplayer games.','连接 Supabase 后即可使用多人游戏。')}</p></section>;
  return <section className="game-room-panel" id="game-room">
    <div className="eyebrow">ACE BAR · PLAY TOGETHER</div>
    <h2>Game <em>Room</em></h2>
    <p>{tr('Gather around, invite your friends and let the games begin.','邀请朋友加入同一房间，开始今晚的小游戏。')}</p>
    <div className="game-room-notice">{tr('No betting. No cash prizes. Every challenge is optional.','不下注、不涉及现金奖励。所有挑战均可自愿选择。')}</div>
    {!room?<div className="game-room-entry">
      <label>{tr('Your name','你的昵称')}<input value={name} onChange={e=>setName(e.target.value)} maxLength={40} placeholder="Alex"/></label>
      <div className="game-room-columns">
        <form className="game-create" onSubmit={createRoom}>
          <h3>{tr('Create a room','创建房间')}</h3>
          <label>{tr('Choose a game','选择游戏')}<select value={game} onChange={e=>setGame(e.target.value)}>{GAMES.map(g=><option key={g[0]} value={g[0]}>{zh?g[2]:g[1]} · {zh?g[3]:g[3]}</option>)}</select></label>
          <label>{tr('Player limit','人数上限')}<select value={maxPlayers} onChange={e=>setMaxPlayers(Number(e.target.value))}>{[2,3,4,5,6,7,8,10,12].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <button disabled={busy}>{tr('Create game room','创建游戏房间')}</button>
        </form>
        <form className="game-join" onSubmit={joinRoom}>
          <h3>{tr('Join with room code','输入房间码加入')}</h3>
          <label>{tr('Room code','房间码')}<input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ACE028"/></label>
          <button disabled={busy}>{tr('Join room','加入房间')}</button>
        </form>
      </div>
      <div className="game-lobby-note">{tr('Scan the same Ace Bar QR code to open this lobby. Choose a waiting room or enter its code to join.','所有人扫描同一个 Ace Bar 二维码进入这里，再输入房间码加入朋友创建的游戏。')}</div>
      <div className="game-open-rooms"><h3>{tr('Open rooms','正在等待的房间')}</h3>{lobbyRooms.length===0?<p>{tr('No rooms are waiting yet. Be the first to create one!','目前没有等待中的房间，创建一个吧！')}</p>:lobbyRooms.map(r=><div className="game-open-room" key={r.id}><div><b>{r.code}</b><small>{zh?GAME_ZH[r.game_type]:GAME_LABEL[r.game_type]} · {tr('Host','主持人')} {r.host_name}</small></div><button type="button" onClick={()=>setCode(r.code)}>{tr('Use code','使用房间码')}</button></div>)}</div>
    </div>:<div className="game-active-room">
      <div className="game-room-top"><div><small>{tr('ROOM CODE','房间码')}</small><strong>{room.code}</strong></div><span className={'game-status '+room.status}>{({waiting:tr('Waiting','等待中'),playing:tr('Playing','游戏中'),finished:tr('Finished','已结束')})[room.status]}</span></div>
      <h3>{zh?GAME_ZH[room.game_type]:GAME_LABEL[room.game_type]}</h3>
      <div className="game-player-list"><b>{tr('Players','玩家')} · {players.length}/{room.max_players}</b>{players.map((p,i)=><div className="game-player" key={p.id}><span>{i+1}. {p.display_name}</span><small>{p.role==='host'?tr('HOST','主持人'):tr('PLAYER','玩家')} · {p.score} {tr('pts','分')}</small></div>)}</div>
      {room.status==='waiting'&&<p>{tr('Waiting for the host to start. At least two players are needed.','等待 Host 开始游戏，至少需要两位玩家。')}</p>}
      {room.status==='waiting'&&hostToken&&<button disabled={busy||players.length<2} onClick={startGame}>{tr('Start game','开始游戏')}</button>}
      {room.status==='playing'&&<div className="game-play-area">
        <h3>{tr('Round','第')} {room.game_state?.round||1}</h3>
        {room.game_type==='liars_dice'?(()=>{
          const order=[...players].sort((a,b)=>new Date(a.joined_at)-new Date(b.joined_at)||a.id.localeCompare(b.id));
          const turn=order[room.game_state?.current_turn||0];
          const bid=room.game_state?.bid;
          const myTurn=turn?.id===playerId;
          const bidPlayer=bid&&players.find(p=>p.id===bid.player_id);
          return <div className="liars-dice-board">
            <div className="liars-turn">{tr('Current turn','当前行动')}：<b>{turn?.display_name||'—'}</b>{myTurn&&<em> · {tr('Your turn','轮到你了')}</em>}</div>
            <div className="liars-my-dice"><b>{tr('Your private dice','你的骰子（仅你可见）')}</b><div className="liars-dice-faces">{myDice.length?myDice.map((d,i)=><span key={i}>{['⚀','⚁','⚂','⚃','⚄','⚅'][d-1]}</span>):<small>{tr('Dice appear when the host starts the game.','主持人开始游戏后显示骰子。')}</small>}</div></div>
            <div className="liars-current-bid"><b>{tr('Current bid','当前叫价')}</b><p>{bid?tr('At least','至少')+' '+bid.count+' × '+tr('face','点数')+' '+bid.face+' · '+(bidPlayer?.display_name||''):tr('No bid yet — make the opening bid.','还没有叫价，请先开价。')}</p></div>
            {myTurn&&<div className="liars-actions">
              <label>{tr('Quantity','数量')}<select value={bidCount} onChange={e=>setBidCount(Number(e.target.value))}>{Array.from({length:Math.max(1,players.length*5)},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
              <label>{tr('Dice face','骰面')}<select value={bidFace} onChange={e=>setBidFace(Number(e.target.value))}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} · {['⚀','⚁','⚂','⚃','⚄','⚅'][n-1]}</option>)}</select></label>
              <button disabled={busy} onClick={()=>play('bid',JSON.stringify({count:bidCount,face:bidFace}))}>{tr('Make a higher bid','提高叫价')}</button>
              {bid&&<button className="game-challenge" disabled={busy} onClick={()=>play('challenge','')}>{tr('Call bluff · Reveal dice','质疑 · 揭晓骰子')}</button>}
            </div>}
            {!myTurn&&<p>{tr('Wait for your turn. You can follow the bids above.','请等待轮到你，留意上方的叫价。')}</p>}
            {lastResult?.type==='challenge'&&<div className="game-last-result"><b>{tr('Last challenge result','上轮质疑结果')}</b><p>{lastResult.bidder} {tr('bid','叫价')} {lastResult.bid?.count} × {lastResult.bid?.face}; {tr('actual count','实际数量')} {lastResult.actual_count}. {tr('Round winner','本轮胜者')}: <strong>{lastResult.winner}</strong></p><div className="liars-reveal">{(lastResult.revealed_dice||[]).map((x,i)=><p key={i}>{x.player}: {(x.dice||[]).map(d=>['⚀','⚁','⚂','⚃','⚄','⚅'][d-1]).join(' ')}</p>)}</div></div>}
          </div>;
        })():<>
          {['higher_lower','red_black','high_low'].includes(room.game_type)&&<label>{tr('Your guess','你的猜测')}<select value={guess} onChange={e=>setGuess(e.target.value)}>{(room.game_type==='red_black'?[['red',tr('Red','红色')],['black',tr('Black','黑色')]]:room.game_type==='high_low'?[['higher',tr('High · 4–6','大 · 4–6')],['lower',tr('Low · 1–3','小 · 1–3')]]:[['higher',tr('Higher','更大')],['lower',tr('Lower','更小')]]).map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>}
          <button disabled={busy} onClick={()=>play('play')}>{room.game_type==='high_low'?tr('Roll dice','掷骰子'):room.game_type==='higher_lower'||room.game_type==='red_black'?tr('Draw next card','翻开下一张牌'):tr('Draw a card','抽一张牌')}</button>
          {lastResult&&<div className="game-last-result"><b>{tr('Latest result','最新结果')}</b><p>{lastResult.player||''} · {lastResult.first_card&&<strong>{lastResult.first_card} → {lastResult.next_card}</strong>} {lastResult.correct!==undefined?(lastResult.correct?tr('Correct · +1 point','猜对了 · +1 分'):tr('Not quite','没猜中')):''} {lastResult.prompt||lastResult.challenge||lastResult.message||''} {lastResult.roll?lastResult.roll:''}</p></div>}
        </>}
        {hostToken&&<button className="game-finish" disabled={busy} onClick={finish}>{tr('End game & show results','结束游戏并公布结果')}</button>}
      </div>}
      {room.status==='finished'&&<div className="game-leaderboard"><h3>{tr('This game leaderboard','本局排行榜')}</h3>{[...players].sort((a,b)=>b.score-a.score).map((p,i)=><div className="game-player" key={p.id}><b>#{i+1} {p.display_name}</b><strong>{p.score} pts</strong></div>)}</div>}
      <button className="game-leave" onClick={leave}>{tr('Leave room on this device','此设备退出房间')}</button>
    </div>}
    {message&&<p className="game-room-message" role="status">{message}</p>}
  </section>;
}
