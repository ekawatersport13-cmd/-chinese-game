import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, onDisconnect, remove } from 'firebase/database';
import chainData from './data/chain_dictionary.json';

// ==================== Firebase 配置 ====================
const firebaseConfig = {
  apiKey: "AIzaSyCyUnzm946N9ammDgXWNdRo7SZNz5XRnTw",
  authDomain: "chinesegame-4317f.firebaseapp.com",
  databaseURL: "https://chinesegame-4317f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chinesegame-4317f",
  storageBucket: "chinesegame-4317f.firebasestorage.app",
  messagingSenderId: "843830906860",
  appId: "1:843830906860:web:52d63501637773539b3ac9",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==================== 类型 ====================
interface ChainWord {
  word: string;
  pinyin: string;
  meaning: string;
  hsk?: number;
}

interface Stone {
  id: number;
  lane: number;
  y: number;
  word: string;
  pinyin: string;
  meaning: string;
  speed: number;
  alive: boolean;
}

interface RoomState {
  phase: 'waiting' | 'playing' | 'gameover' | 'countdown';
  hostScore: number;
  guestScore: number;
  hostLane: number;
  guestLane: number;
  difficulty: number;
  stones: Stone[];
  timeLeft: number;
  gameDuration: number;
  winner: 'host' | 'guest' | 'tie' | null;
  lastUpdate: number;
}

// ==================== 常量 ====================
const GAME_H = 520;
const GAME_W = 480;
const PLAYER_H = 44;
const PLAYER_W = 38;
const PLAYER_Y = GAME_H - PLAYER_H - 8;
const STONE_W = 52;
const STONE_H = 58;
const NUM_LANES = 8;

const LANES = Array.from({ length: NUM_LANES }, (_, i) => {
  const laneWidth = GAME_W / NUM_LANES;
  return i * laneWidth + (laneWidth - STONE_W) / 2;
});

const LANE_COLORS = [
  { bg: 'from-cyan-600 to-blue-700',   border: 'border-cyan-400/50',   text: 'text-cyan-100',   glow: '#22d3ee', label: '1' },
  { bg: 'from-blue-600 to-indigo-700',  border: 'border-blue-400/50',   text: 'text-blue-100',   glow: '#60a5fa', label: '2' },
  { bg: 'from-indigo-600 to-violet-700',border: 'border-indigo-400/50', text: 'text-indigo-100', glow: '#818cf8', label: '3' },
  { bg: 'from-violet-600 to-purple-700',border: 'border-violet-400/50', text: 'text-violet-100', glow: '#a78bfa', label: '4' },
  { bg: 'from-purple-600 to-fuchsia-700',border:'border-purple-400/50', text: 'text-purple-100', glow: '#c084fc', label: '5' },
  { bg: 'from-fuchsia-600 to-pink-700', border: 'border-fuchsia-400/50',text: 'text-fuchsia-100',glow: '#e879f9', label: '6' },
  { bg: 'from-pink-600 to-rose-700',   border: 'border-pink-400/50',   text: 'text-pink-100',   glow: '#f472b6', label: '7' },
  { bg: 'from-rose-600 to-red-700',    border: 'border-rose-400/50',   text: 'text-rose-100',   glow: '#fb7185', label: '8' },
];

const DURATIONS = [
  { label: '1 分钟', value: 60 },
  { label: '3 分钟', value: 180 },
  { label: '5 分钟', value: 300 },
];

const LEFT_WORDS: ChainWord[] = (chainData as any).words
  ? Object.entries((chainData as any).words)
      .filter(([w]: [string, any]) => w.length >= 2 && w.length <= 4)
      .map(([word, entry]: [string, any]) => ({
        word, pinyin: entry.pinyin || '', meaning: entry.meaning || '', hsk: entry.hsk || 1
      }))
  : [];

const getWordsByLevel = (maxLevel: number): ChainWord[] => {
  return LEFT_WORDS.filter(w => w.hsk !== undefined && w.hsk <= maxLevel);
};

const getRandomWord = (difficulty: number): ChainWord => {
  const pool = getWordsByLevel(Math.min(difficulty, 11));
  if (pool.length === 0) return LEFT_WORDS[Math.floor(Math.random() * LEFT_WORDS.length)] || { word: '漂亮', pinyin: 'piàoliang', meaning: 'cantik', hsk: 1 };
  return pool[Math.floor(Math.random() * pool.length)];
};

// ==================== 生成房间ID ====================
const generateRoomId = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ==================== 主组件 ====================
export default function HeartbeatGameOnline({ onExit }: { onExit: () => void }) {
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [hasGuest, setHasGuest] = useState(false);
  const [particles, setParticles] = useState<{id:number,x:number,y:number,vx:number,vy:number,color:string,life:number,size:number}[]>([]);

  // 游戏状态
  const [phase, setPhase] = useState<'menu' | 'countdown' | 'playing' | 'gameover' | 'waiting' | 'kicked'>('menu');
  const [difficulty, setDifficulty] = useState(1);
  const [gameDuration, setGameDuration] = useState(60);
  const [timeLeft, setTimeLeft] = useState(0);
  const [countdown, setCountdown] = useState(3);

  // 主播状态
  const [hostScore, setHostScore] = useState(0);
  const [hostLane, setHostLane] = useState(0);

  // 观众状态
  const [guestScore, setGuestScore] = useState(0);
  const [guestLane, setGuestLane] = useState(7);

  // 石头
  const [stones, setStones] = useState<Stone[]>([]);

  // Refs
  const roomRef = useRef<any>(null);
  const userId = useRef(`user_${Math.random().toString(36).substr(2, 9)}`);
  const frameRef = useRef<number>(0);
  const lastSpawnRef = useRef(0);
  const stoneIdRef = useRef(0);
  const particleIdRef = useRef(0);
  const inputRef = useRef('');
  const timerRef = useRef<any>(null);
  const animRef = useRef({
    stones: [] as Stone[],
    hostLane: 0,
    guestLane: 7,
    hostScore: 0,
    guestScore: 0,
    timeLeft: 0,
  });
  const difficultyRef = useRef(difficulty);
  const phaseRef = useRef(phase);
  const syncToFirebaseRef = useRef<() => void>(() => {});

  useEffect(() => { inputRef.current = input; }, [input]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  // ==================== 粒子效果 ====================
  const spawnParticles = useCallback((x: number, y: number, color: string, count: number) => {
    const newParts: typeof particles = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      newParts.push({
        id: particleIdRef.current++,
        x: x + PLAYER_W / 2,
        y: y + PLAYER_H / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        color,
        life: 1,
        size: 3 + Math.random() * 4,
      });
    }
    setParticles(prev => [...prev.slice(-30), ...newParts]);
  }, []);

  // ==================== 同步到 Firebase ====================
  const syncToFirebase = useCallback(() => {
    if (!roomRef.current || role !== 'host') return;
    const st = animRef.current;
    set(ref(db, `rooms/${roomId}/state`), {
      phase: phaseRef.current,
      hostScore: st.hostScore,
      guestScore: st.guestScore,
      hostLane: st.hostLane,
      guestLane: st.guestLane,
      difficulty: difficultyRef.current,
      stones: st.stones.map(s => ({ ...s })),
      timeLeft: st.timeLeft,
      gameDuration,
      winner: null,
      lastUpdate: Date.now(),
    });
  }, [role, roomId, gameDuration]);

  useEffect(() => { syncToFirebaseRef.current = syncToFirebase; }, [syncToFirebase]);

  // ==================== 生成石头 ====================
  const spawnStone = useCallback(() => {
    const word = getRandomWord(difficultyRef.current);
    const lane = Math.floor(Math.random() * NUM_LANES);
    const newStone: Stone = {
      id: stoneIdRef.current++,
      lane,
      y: -STONE_H,
      word: word.word,
      pinyin: word.pinyin,
      meaning: word.meaning,
      speed: 0.8 + Math.random() * 0.4,
      alive: true,
    };
    animRef.current.stones = [...animRef.current.stones, newStone];
  }, []);

  // ==================== 处理答案（主播端） ====================
  const processAnswer = useCallback((answer: string, who: 'host' | 'guest') => {
    const trimmed = answer.trim();
    if (!trimmed) return false;

    const state = animRef.current;
    let matched = false;

    for (let i = 0; i < state.stones.length; i++) {
      const stone = state.stones[i];
      if (!stone.alive) continue;
      if (stone.word === trimmed) {
        matched = true;
        stone.alive = false;

        const lane = stone.lane;
        const colors = LANE_COLORS[lane];
        const laneX = LANES[lane];

        if (who === 'host') {
          // 主播答题
          if (state.guestLane === lane) {
            // 赛道被观众占了，只能得一半分，不移动
            state.hostScore += 50;
            spawnParticles(laneX + STONE_W/2, PLAYER_Y, colors.glow, 8);
          } else {
            // 赛道空闲，移动过去
            state.hostLane = lane;
            state.hostScore += 100;
            spawnParticles(laneX + STONE_W/2, PLAYER_Y, colors.glow, 14);
          }
          setHostScore(state.hostScore);
          setHostLane(state.hostLane);
        } else {
          // 观众答题
          if (state.hostLane === lane) {
            // 赛道被主播占了，只能得一半分，不移动
            state.guestScore += 50;
            spawnParticles(laneX + STONE_W/2, PLAYER_Y, colors.glow, 8);
          } else {
            // 赛道空闲，移动过去
            state.guestLane = lane;
            state.guestScore += 100;
            spawnParticles(laneX + STONE_W/2, PLAYER_Y, colors.glow, 14);
          }
          setGuestScore(state.guestScore);
          setGuestLane(state.guestLane);
        }

        // 生成新石头替代
        setTimeout(() => spawnStone(), 500);
        break;
      }
    }

    return matched;
  }, [spawnStone]);

  // ==================== 观众输入处理（主播端） ====================
  useEffect(() => {
    if (role !== 'host' || !roomRef.current) return;

    const unsub = onValue(ref(db, `rooms/${roomId}/guestInput`), (snap) => {
      const guestVal = snap.val();
      if (guestVal && guestVal.trim()) {
        // 清空观众输入
        set(ref(db, `rooms/${roomId}/guestInput`), '');
        // 处理答案
        processAnswer(guestVal, 'guest');
      }
    });

    return () => unsub();
  }, [role, roomId, processAnswer]);

  // ==================== 游戏循环（主播端） ====================
  const gameLoop = useCallback((ts: number) => {
    if (phaseRef.current !== 'playing') return;

    const state = animRef.current;

    // 生成石头
    const spawnInterval = 2500;
    if (ts - lastSpawnRef.current > spawnInterval) {
      lastSpawnRef.current = ts;
      if (state.stones.filter(s => s.alive).length < 5) {
        spawnStone();
      }
    }

    // 更新石头位置
    state.stones = state.stones
      .map(s => {
        if (!s.alive) return s;
        return { ...s, y: s.y + s.speed };
      })
      .filter(s => s.y < GAME_H + 50);

    setStones([...state.stones]);
    syncToFirebaseRef.current();

    frameRef.current = requestAnimationFrame(gameLoop);
  }, []);

  useEffect(() => {
    if (phase === 'playing' && role === 'host') {
      lastSpawnRef.current = performance.now();
      frameRef.current = requestAnimationFrame(gameLoop);
    }
    return () => cancelAnimationFrame(frameRef.current);
  }, [phase, gameLoop, role]);

  // 粒子动画
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'gameover') return;
    const id = setInterval(() => {
      setParticles(prev => prev.map(p => ({
        ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.15, life: p.life - 0.04
      })).filter(p => p.life > 0));
    }, 16);
    return () => clearInterval(id);
  }, [phase]);

  // ==================== 倒计时 ====================
  useEffect(() => {
    if (phase !== 'countdown') return;
    setCountdown(3);
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(id);
          startGamePlay();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ==================== 游戏计时器 ====================
  useEffect(() => {
    if (phase !== 'playing' || role !== 'host') return;
    timerRef.current = setInterval(() => {
      animRef.current.timeLeft -= 1;
      setTimeLeft(animRef.current.timeLeft);
      if (animRef.current.timeLeft <= 0) {
        clearInterval(timerRef.current);
        endGame();
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, role]);

  // ==================== 观众端同步 ====================
  useEffect(() => {
    if (role !== 'guest' || !roomId) return;

    const unsub = onValue(ref(db, `rooms/${roomId}/state`), (snap) => {
      const state = snap.val() as RoomState | null;
      if (!state) return;

      setPhase(state.phase as any);
      setHostScore(state.hostScore ?? 0);
      setGuestScore(state.guestScore ?? 0);
      setHostLane(state.hostLane ?? 0);
      setGuestLane(state.guestLane ?? 7);
      setDifficulty(state.difficulty ?? 1);
      setStones(state.stones ?? []);
      setTimeLeft(state.timeLeft ?? 0);
      setGameDuration(state.gameDuration ?? 60);
      animRef.current = {
        stones: state.stones ?? [],
        hostLane: state.hostLane ?? 0,
        guestLane: state.guestLane ?? 7,
        hostScore: state.hostScore ?? 0,
        guestScore: state.guestScore ?? 0,
        timeLeft: state.timeLeft ?? 0,
      };
    });

    return () => unsub();
  }, [role, roomId]);

  // ==================== 观众端发送输入 ====================
  const sendGuestInput = useCallback((val: string) => {
    if (!roomId) return;
    set(ref(db, `rooms/${roomId}/guestInput`), val);
  }, [roomId]);

  // ==================== 房间操作 ====================
  const createRoom = async (level: number, duration: number) => {
    const newRoomId = generateRoomId();
    const roomData = {
      hostId: userId.current,
      hostKicked: false,
      hasGuest: false,
      guestId: null,
      guestInput: '',
      difficultyLevel: level,
      gameDuration: duration,
      createdAt: Date.now(),
      state: {
        phase: 'waiting',
        hostScore: 0,
        guestScore: 0,
        hostLane: 0,
        guestLane: 7,
        difficulty: level,
        stones: [],
        timeLeft: duration,
        gameDuration: duration,
        winner: null,
        lastUpdate: Date.now(),
      }
    };

    await set(ref(db, `rooms/${newRoomId}`), roomData);
    roomRef.current = ref(db, `rooms/${newRoomId}`);

    onValue(ref(db, `rooms/${newRoomId}/hasGuest`), (snap) => {
      setHasGuest(snap.val() === true);
    });

    onDisconnect(ref(db, `rooms/${newRoomId}`)).remove();

    setRoomId(newRoomId);
    setRole('host');
    setDifficulty(level);
    setGameDuration(duration);
    setPhase('waiting');
  };

  const joinRoom = async () => {
    const roomCode = joinRoomId.trim().toUpperCase();
    if (!roomCode) {
      setError('请输入房间号');
      return;
    }

    const roomSnapshot = await new Promise<any>((resolve) => {
      onValue(ref(db, `rooms/${roomCode}`), (snap) => resolve(snap.val()), { onlyOnce: true });
    });

    if (!roomSnapshot) {
      setError('房间不存在');
      return;
    }

    if (roomSnapshot.hasGuest) {
      setError('房间已有观众');
      return;
    }

    await set(ref(db, `rooms/${roomCode}/guestId`), userId.current);
    await set(ref(db, `rooms/${roomCode}/hasGuest`), true);

    roomRef.current = ref(db, `rooms/${roomCode}`);

    onDisconnect(ref(db, `rooms/${roomCode}/hasGuest`)).remove();
    onDisconnect(ref(db, `rooms/${roomCode}/guestId`)).remove();

    setRoomId(roomCode);
    setRole('guest');
    setError('');
  };

  const kickGuest = async () => {
    if (!roomId) return;
    await set(ref(db, `rooms/${roomId}/hostKicked`), true);
    await set(ref(db, `rooms/${roomId}/hasGuest`), false);
    await set(ref(db, `rooms/${roomId}/guestId`), null);
    setHasGuest(false);
  };

  const leaveRoom = async () => {
    if (roomId) {
      if (role === 'host') {
        await remove(ref(db, `rooms/${roomId}`));
      } else {
        await set(ref(db, `rooms/${roomId}/hasGuest`), false);
        await set(ref(db, `rooms/${roomId}/guestId`), null);
      }
    }
    roomRef.current = null;
    setRole(null);
    setRoomId('');
    setPhase('menu');
    setHasGuest(false);
    setHostScore(0);
    setGuestScore(0);
    setHostLane(0);
    setGuestLane(7);
    setStones([]);
  };

  // ==================== 开始游戏 ====================
  const startGame = () => {
    setPhase('countdown');
  };

  const startGamePlay = () => {
    // 重置状态
    setHostScore(0);
    setGuestScore(0);
    setHostLane(0);
    setGuestLane(7);
    setStones([]);
    setTimeLeft(gameDuration);
    setInput('');

    animRef.current = {
      stones: [],
      hostLane: 0,
      guestLane: 7,
      hostScore: 0,
      guestScore: 0,
      timeLeft: gameDuration,
    };

    // 预生成几个石头
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (phaseRef.current === 'playing') spawnStone();
      }, i * 600);
    }

    setPhase('playing');
  };

  const endGame = () => {
    setPhase('gameover');
    cancelAnimationFrame(frameRef.current);
    clearInterval(timerRef.current);

    // 先同步最终分数（确保最后一帧的分数被写入 Firebase）
    syncToFirebaseRef.current();

    const st = animRef.current;
    let winner: 'host' | 'guest' | 'tie' | null = null;
    if (st.hostScore > st.guestScore) winner = 'host';
    else if (st.guestScore > st.hostScore) winner = 'guest';
    else winner = 'tie';

    // 同步最终状态（带 winner）
    if (roomRef.current && role === 'host') {
      set(ref(db, `rooms/${roomId}/state`), {
        phase: 'gameover',
        hostScore: st.hostScore,
        guestScore: st.guestScore,
        hostLane: st.hostLane,
        guestLane: st.guestLane,
        difficulty: difficultyRef.current,
        stones: [],
        timeLeft: 0,
        gameDuration,
        winner,
        lastUpdate: Date.now(),
      });
    }
  };

  // ==================== 输入处理 ====================
  const handleInputChange = (val: string) => {
    setInput(val);
    if (!val.trim() || phase !== 'playing') return;
    if (role === 'host') {
      if (processAnswer(val, 'host')) {
        setInput('');
      }
    } else if (role === 'guest') {
      const state = animRef.current;
      const matched = state.stones.some(s => s.alive && s.word === val.trim());
      if (matched) {
        sendGuestInput(val.trim());
        setInput('');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (role === 'host') {
        cancelAnimationFrame(frameRef.current);
        clearInterval(timerRef.current);
        setPhase('waiting');
        syncToFirebaseRef.current();
      }
    }
  };

  // ==================== 渲染 ====================

  // 主菜单
  if (phase === 'menu' || !role) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-950 to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900/90 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-purple-800/40"
        >
          <motion.div className="text-center mb-8" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}>
            <div className="text-6xl mb-3">🏆</div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-purple-500">
              竞技联机模式
            </h1>
            <p className="text-purple-300/70 text-sm mt-2">Competitive Online Mode</p>
          </motion.div>

          {role === null ? (
            <>
              <p className="text-center text-gray-400 text-sm mb-4">选择你的角色</p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => setRole('host')}
                  className="py-6 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-lg border-2 border-purple-400/50">
                  <div className="text-4xl mb-2">🎙️</div>
                  <div className="font-black text-lg">主播</div>
                  <div className="text-xs opacity-70 mt-1">创建房间</div>
                </motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => setRole('guest')}
                  className="py-6 rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-lg border-2 border-cyan-400/50">
                  <div className="text-4xl mb-2">👥</div>
                  <div className="font-black text-lg">观众</div>
                  <div className="text-xs opacity-70 mt-1">加入房间</div>
                </motion.button>
              </div>
              <button onClick={onExit} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-all">
                ← 返回主菜单
              </button>
            </>
          ) : role === 'host' ? (
            <>
              <div className="bg-purple-900/30 rounded-2xl p-4 mb-4 border border-purple-700/40">
                <h3 className="text-purple-300 font-bold text-sm mb-2">🎙️ 主播模式</h3>
                <p className="text-gray-400 text-xs">1. 选择难度和时间</p>
                <p className="text-gray-400 text-xs">2. 创建房间并分享</p>
                <p className="text-gray-400 text-xs">3. 和观众比赛打字！</p>
              </div>

              <p className="text-center text-gray-400 text-xs mb-2">选择难度</p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(lvl => (
                  <motion.button key={lvl} whileTap={{ scale: 0.9 }}
                    onClick={() => setDifficulty(lvl)}
                    className={`py-2 rounded-lg font-bold text-sm shadow-lg ${difficulty === lvl ? 'bg-yellow-500 text-black' : 'bg-gradient-to-br from-purple-600 to-pink-600 text-white'}`}>
                    HSK{lvl}
                  </motion.button>
                ))}
              </div>
              <motion.button whileTap={{ scale: 0.95 }}
                onClick={() => setDifficulty(11)}
                className={`w-full py-2 rounded-lg font-bold text-sm shadow-lg mb-4 ${difficulty === 11 ? 'bg-yellow-500 text-black' : 'bg-gradient-to-r from-red-600 to-pink-600 text-white'}`}>
                全部难度
              </motion.button>

              <p className="text-center text-gray-400 text-xs mb-2">游戏时间</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {DURATIONS.map(d => (
                  <motion.button key={d.value} whileTap={{ scale: 0.9 }}
                    onClick={() => setGameDuration(d.value)}
                    className={`py-2 rounded-lg font-bold text-sm shadow-lg ${gameDuration === d.value ? 'bg-yellow-500 text-black' : 'bg-gradient-to-br from-blue-600 to-cyan-600 text-white'}`}>
                    {d.label}
                  </motion.button>
                ))}
              </div>

              <motion.button whileTap={{ scale: 0.95 }}
                onClick={() => createRoom(difficulty, gameDuration)}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold shadow-lg mb-3">
                🎮 创建房间
              </motion.button>
              <button onClick={() => setRole(null)} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-all">
                ← 返回
              </button>
            </>
          ) : (
            <>
              <div className="bg-cyan-900/30 rounded-2xl p-4 mb-6 border border-cyan-700/40">
                <h3 className="text-cyan-300 font-bold text-sm mb-2">👥 观众模式</h3>
                <p className="text-gray-400 text-xs">输入主播分享的房间号</p>
                <p className="text-gray-400 text-xs">即可加入比赛！</p>
              </div>
              <div className="mb-4">
                <input type="text" value={joinRoomId}
                  onChange={e => setJoinRoomId(e.target.value.toUpperCase())}
                  placeholder="输入房间号..." maxLength={6}
                  className="w-full bg-gray-800 border-2 border-cyan-700 rounded-xl px-4 py-3 text-white text-center text-2xl font-bold tracking-widest uppercase placeholder-gray-600 outline-none focus:border-cyan-500" />
                {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
              </div>
              <motion.button whileTap={{ scale: 0.95 }} onClick={joinRoom}
                className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-bold text-lg shadow-lg mb-4">
                加入房间
              </motion.button>
              <button onClick={() => setRole(null)} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-all">
                ← 返回
              </button>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // 等待观众
  if (phase === 'waiting' && role === 'host') {
    const shareUrl = `${window.location.origin}?room=${roomId}`;
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-950 to-gray-900 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900/90 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-purple-800/40 text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="text-2xl font-black text-purple-400 mb-2">等待观众加入...</h2>
          <p className="text-gray-400 text-sm mb-2">房间号：<span className="text-white font-bold text-xl">{roomId}</span></p>
          <p className="text-gray-500 text-xs mb-4">难度：HSK{difficulty} | 时间：{gameDuration / 60}分钟</p>

          <div className="bg-gray-800 rounded-xl p-4 mb-6">
            <p className="text-gray-400 text-xs mb-2">分享链接给观众：</p>
            <div className="bg-gray-900 rounded-lg p-2 text-xs text-cyan-400 break-all mb-3 font-mono">{shareUrl}</div>
            <button onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-bold transition-all">
              📋 复制链接
            </button>
          </div>

          {hasGuest ? (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="bg-green-900/30 rounded-xl p-4 mb-6 border border-green-700/40">
              <p className="text-green-400 font-bold">✅ 观众已连接！</p>
            </motion.div>
          ) : (
            <div className="bg-yellow-900/30 rounded-xl p-4 mb-6 border border-yellow-700/40">
              <p className="text-yellow-400 text-sm">等待观众输入房间号加入...</p>
            </div>
          )}

          <div className="space-y-3">
            {hasGuest && (
              <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} whileTap={{ scale: 0.95 }}
                onClick={startGame}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg shadow-lg">
                🎮 开始游戏
              </motion.button>
            )}
            <button onClick={hasGuest ? kickGuest : leaveRoom}
              className="w-full py-3 bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white rounded-xl text-sm transition-all">
              {hasGuest ? '🚫 踢出观众' : '❌ 离开房间'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // 观众等待
  if (phase === 'waiting' && role === 'guest') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-cyan-950 to-gray-900 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900/90 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-cyan-800/40 text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} className="text-6xl mb-4">🎧</motion.div>
          <h2 className="text-2xl font-black text-cyan-400 mb-2">已连接房间</h2>
          <p className="text-gray-400 text-sm mb-6">房间号：<span className="text-white font-bold">{roomId}</span></p>
          <div className="bg-cyan-900/30 rounded-xl p-4 mb-6 border border-cyan-700/40">
            <p className="text-cyan-300 font-bold">✅ 等待主播开始游戏...</p>
            <p className="text-gray-400 text-xs mt-2">准备好输入汉字！</p>
          </div>
          <button onClick={leaveRoom} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-all">
            ← 离开房间
          </button>
        </motion.div>
      </div>
    );
  }

  // 被踢出
  if (phase === 'kicked') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-red-950 to-gray-900 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900/90 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-red-800/40 text-center">
          <div className="text-7xl mb-4">🚫</div>
          <h2 className="text-2xl font-black text-red-400 mb-4">你被移出房间</h2>
          <button onClick={() => { setRole(null); setPhase('menu'); setRoomId(''); }}
            className="w-full py-4 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-xl font-bold text-lg shadow-lg">
            返回主菜单
          </button>
        </motion.div>
      </div>
    );
  }

  // 倒计时
  if (phase === 'countdown') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-950 to-gray-900 flex items-center justify-center">
        <motion.div
          key={countdown}
          initial={{ scale: 3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="text-9xl font-black text-white">
          {countdown > 0 ? countdown : 'GO!'}
        </motion.div>
      </div>
    );
  }

  // 游戏结束
  if (phase === 'gameover') {
    const isHostWinner = hostScore > guestScore;
    const isTie = hostScore === guestScore;
    const hostWins = role === 'host' && isHostWinner;
    const guestWins = role === 'guest' && !isHostWinner && !isTie;

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-950 to-gray-900 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900/90 rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-purple-800/40 text-center">
          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5 }} className="text-7xl mb-4">
            {isTie ? '🤝' : (hostWins || guestWins) ? '🏆' : '😢'}
          </motion.div>
          <h2 className="text-2xl font-black text-yellow-400 mb-2">
            {isTie ? '平局！' : (hostWins || guestWins) ? '你赢了！' : '你输了！'}
          </h2>

          <div className="bg-gray-800/60 rounded-2xl p-4 mb-6 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-purple-400 font-bold">🎙️ 主播</span>
              <span className="text-yellow-400 font-black text-xl">{hostScore}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-cyan-400 font-bold">👥 观众</span>
              <span className="text-yellow-400 font-black text-xl">{guestScore}</span>
            </div>
            <div className="border-t border-gray-700 pt-2">
              <span className="text-gray-400 text-xs">难度：HSK{difficulty} | 时间：{gameDuration / 60}分钟</span>
            </div>
          </div>

          {role === 'host' && (
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold text-lg shadow-lg mb-3">
              再来一局
            </motion.button>
          )}
          <button onClick={leaveRoom}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-xl text-sm transition-all">
            {role === 'host' ? '解散房间' : '离开房间'}
          </button>
        </motion.div>
      </div>
    );
  }

  // 游戏中
  const activeStones = stones.filter(s => s.alive);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-indigo-950/60 to-gray-900 flex flex-col items-center justify-center p-2">
      {/* HUD */}
      <div className="w-full max-w-lg flex justify-between items-center mb-2 px-2">
        <button onClick={() => {
          if (role === 'host') {
            cancelAnimationFrame(frameRef.current);
            clearInterval(timerRef.current);
            setPhase('waiting');
            syncToFirebaseRef.current();
          } else {
            leaveRoom();
          }
        }} className="text-gray-500 hover:text-white text-xs transition-colors">
          ✕ {role === 'host' ? '暂停' : '离开'}
        </button>

        {/* 主播分数 */}
        <div className="flex items-center gap-2 bg-purple-900/40 rounded-lg px-3 py-1 border border-purple-700/40">
          <span className="text-lg">🎙️</span>
          <span className="text-purple-300 font-bold text-sm">主播</span>
          <motion.span key={hostScore} animate={{ scale: [1, 1.3, 1] }} className="text-yellow-400 font-black text-lg">
            {hostScore}
          </motion.span>
        </div>

        {/* 倒计时 */}
        <div className={`font-black text-xl ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          {timeStr}
        </div>

        {/* 观众分数 */}
        <div className="flex items-center gap-2 bg-cyan-900/40 rounded-lg px-3 py-1 border border-cyan-700/40">
          <span className="text-lg">👥</span>
          <span className="text-cyan-300 font-bold text-sm">观众</span>
          <motion.span key={guestScore} animate={{ scale: [1, 1.3, 1] }} className="text-yellow-400 font-black text-lg">
            {guestScore}
          </motion.span>
        </div>
      </div>

      {/* Game Area */}
      <div ref={el => {
        if (el) {
          const vw = window.innerWidth - 16;
          el.style.zoom = vw < GAME_W ? String(vw / GAME_W) : '1';
        }
      }}
        className="relative overflow-hidden rounded-2xl border-2 border-indigo-900/60 bg-gray-900/80 shadow-2xl"
        style={{ width: GAME_W, height: GAME_H }}>

        {/* Lane guides */}
        {Array.from({ length: NUM_LANES }).map((_, i) => (
          <div key={i} className="absolute top-0 bottom-0 w-px opacity-10"
            style={{ left: (i + 0.5) * (GAME_W / NUM_LANES), backgroundColor: LANE_COLORS[i].glow }} />
        ))}

        {/* Lane numbers at top */}
        {Array.from({ length: NUM_LANES }).map((_, i) => (
          <div key={`num-${i}`} className="absolute top-1 text-[10px] font-bold opacity-30"
            style={{ left: (i + 0.5) * (GAME_W / NUM_LANES), transform: 'translateX(-50%)', color: LANE_COLORS[i].glow }}>
            {i + 1}
          </div>
        ))}

        {/* Falling Stones */}
        <AnimatePresence>
          {activeStones.map(s => {
            const colors = LANE_COLORS[s.lane];
            return (
              <motion.div key={s.id}
                initial={{ opacity: 0, scale: 0.5, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: s.y }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: 'linear' }}
                className={`absolute flex flex-col items-center justify-center rounded-lg shadow-lg bg-gradient-to-br ${colors.bg} ${colors.border} border-2`}
                style={{ width: STONE_W, height: STONE_H, left: LANES[s.lane] }}>
                <div className={`text-[10px] font-bold ${colors.text} leading-tight text-center px-1`}>
                  {s.pinyin}
                </div>
                <div className="text-[8px] opacity-80 text-white mt-0.5 leading-tight text-center px-0.5">
                  {s.meaning}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Particles */}
        {particles.map(p => (
          <div key={p.id} className="absolute rounded-full pointer-events-none"
            style={{ left: p.x, top: p.y, width: p.size, height: p.size, background: p.color, opacity: p.life, boxShadow: `0 0 ${p.size * 2}px ${p.color}` }} />
        ))}

        {/* Host Character */}
        <motion.div
          animate={{ x: LANES[hostLane] + (STONE_W - PLAYER_W) / 2, y: PLAYER_Y }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="absolute flex flex-col items-center justify-center rounded-xl shadow-xl border-2 bg-gradient-to-br from-purple-500 to-pink-600 border-purple-300"
          style={{ width: PLAYER_W, height: PLAYER_H }}>
          <div className="text-xl">🎙️</div>
          <div className="text-[9px] font-bold text-purple-100">主播</div>
        </motion.div>

        {/* Guest Character */}
        <motion.div
          animate={{ x: LANES[guestLane] + (STONE_W - PLAYER_W) / 2, y: PLAYER_Y }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="absolute flex flex-col items-center justify-center rounded-xl shadow-xl border-2 bg-gradient-to-br from-cyan-500 to-blue-600 border-cyan-300"
          style={{ width: PLAYER_W, height: PLAYER_H }}>
          <div className="text-xl">👥</div>
          <div className="text-[9px] font-bold text-cyan-100">观众</div>
        </motion.div>
      </div>

      {/* Input Area */}
      <div className="w-full max-w-lg mt-3 px-2">
        <div className="relative">
          <div className="text-white text-xs font-bold mb-1 flex items-center gap-1">
            <span>⌨️</span>
            {role === 'host' ? (
              <>主播：输入石头上的汉字抢赛道！<span className="text-purple-400">(+100分)</span></>
            ) : (
              <>观众：输入石头上的汉字抢赛道！<span className="text-cyan-400">(+100分)</span></>
            )}
          </div>
          <div className={`relative rounded-xl border-2 transition-all ${
            input.length > 0 ? 'border-white bg-gray-800 shadow-[0_0_20px_rgba(255,255,255,0.15)]' : 'border-gray-700 bg-gray-800/60'
          }`}>
            <input
              type="text"
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入汉字..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-transparent px-3 py-3 text-white text-lg font-bold outline-none placeholder-gray-600 text-center"
              autoFocus
            />
          </div>
        </div>
      </div>

      {/* Hint */}
      <div className="w-full max-w-lg mt-2 px-2">
        <div className="text-xs text-gray-500 text-center">
          💡 看石头上的拼音/意思 → 输入对应汉字 → 抢占赛道得分！
          {role === 'host' && <span className="ml-2 text-gray-600">ESC暂停</span>}
        </div>
      </div>
    </div>
  );
}
