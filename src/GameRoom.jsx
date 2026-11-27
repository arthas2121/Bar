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
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [guess,setGuess]=useState('higher');
  const [maxPlayers,setMaxPlayers]=useState(8);
  const [lobbyRooms,setLobbyRooms]=useState([]);
  const [lastResult,setLastResult]=useState(null);
  const tr=(en,cn)=>zh?cn:en;
  const loadLobby=async()=>{const {data}=await supabase.from('game_rooms').select('id,code,host_name,game_type,max_players,created_at').eq('status','waiting').order('created_at',{ascending:false}).limit(20);setLobbyRooms(data||[]);};
  const loadRoom=async id=>{
    const [r,p,g]=await Promise.all([
      supabase.from('game_rooms').select('*').eq('id',id).maybeSingle(),
      supabase.from('game_players').select('*').eq('room_id',id).order('joined_at'),
      supabase.from('game_rounds').select('*').eq('room_id',id).order('created_at',{ascending:false}).limit(20)
    ]);
    if(r.error||!r.data){setMessage(tr('Could not load room. Please refresh.','无法读取房间，请刷新页面。'));return;}
    setRoom(r.data);setPlayers(p.data||[]);setRounds(g.data||[]);
    if(r.data.game_state?.last_result)setLastResult(r.data.game_state.last_result);
  };
  useEffect(()=>{
    loadLobby();
    const saved=JSON.parse(localStorage.getItem('ace-game-session')||'null');
    if(saved?.room_id&&saved?.player_token){setToken(saved.player_token);setHostToken(saved.host_token||'');loadRoom(saved.room_id);}
  },[]);
  useEffect(()=>{
    if(!room?.id)return;
    const channel=supabase.channel('ace-game-'+room.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'game_rooms',filter:'id=eq.'+room.id},()=>loadRoom(room.id))
      .on('postgres_changes',{event:'*',schema:'public',table:'game_players',filter:'room_id=eq.'+room.id},()=>loadRoom(room.id))
      .on('postgres_changes',{event:'*',schema:'public',table:'game_rounds',filter:'room_id=eq.'+room.id},()=>loadRoom(room.id))
      .subscribe();
    const timer=setInterval(()=>{loadRoom(room.id);loadLobby();},5000);
    return()=>{clearInterval(timer);supabase.removeChannel(channel);};
  },[room?.id]);
  const saveSession=data=>{
    const s={...data};localStorage.setItem('ace-game-session',JSON.stringify(s));
    setToken(s.player_token||'');setHostToken(s.host_token||'');loadRoom(s.room_id);
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
  const play=async action=>{
    setBusy(true);const {data,error}=await supabase.rpc('game_play_round',{p_room:room.id,p_token:token,p_action:action,p_guess:guess});setBusy(false);
    if(error){setMessage(error.message);return;}setLastResult(data);loadRoom(room.id);
  };
  const finish=async()=>{
    setBusy(true);const {error}=await supabase.rpc('game_host_finish',{p_room:room.id,p_token:hostToken});setBusy(false);
    if(error)setMessage(error.message);loadRoom(room.id);
  };
  const leave=()=>{localStorage.removeItem('ace-game-session');setRoom(null);setPlayers([]);setRounds([]);setToken('');setHostToken('');setLastResult(null);setMessage('');};
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
        {['higher_lower','red_black'].includes(room.game_type)&&<label>{tr('Your guess','你的猜测')}<select value={guess} onChange={e=>setGuess(e.target.value)}>{(room.game_type==='red_black'?[['red',tr('Red','红色')],['black',tr('Black','黑色')]]:[['higher',tr('Higher','更大')],['lower',tr('Lower','更小')]]).map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>}
        <button disabled={busy} onClick={()=>play('play')}>{room.game_type.includes('dice')||room.game_type==='high_low'?tr('Roll dice','掷骰子'):room.game_type==='higher_lower'||room.game_type==='red_black'?tr('Draw next card','翻开下一张牌'):tr('Draw a card','抽一张牌')}</button>
        {lastResult&&<div className="game-last-result"><b>{tr('Latest result','最新结果')}</b><pre>{JSON.stringify(lastResult,null,2)}</pre></div>}
        {hostToken&&<button className="game-finish" disabled={busy} onClick={finish}>{tr('End game & show results','结束游戏并公布结果')}</button>}
      </div>}
      {room.status==='finished'&&<div className="game-leaderboard"><h3>{tr('This game leaderboard','本局排行榜')}</h3>{[...players].sort((a,b)=>b.score-a.score).map((p,i)=><div className="game-player" key={p.id}><b>#{i+1} {p.display_name}</b><strong>{p.score} pts</strong></div>)}</div>}
      <button className="game-leave" onClick={leave}>{tr('Leave room on this device','此设备退出房间')}</button>
    </div>}
    {message&&<p className="game-room-message" role="status">{message}</p>}
  </section>;
}
