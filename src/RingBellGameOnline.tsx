import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ref, set, onValue, remove, serverTimestamp, get } from 'firebase/database';
import { db } from './firebase';
import synonymAntonymData from './data/synonym_antonym.json';
import { getDeviceId } from './deviceId';

// ==================== 类型 ====================
interface WordEntry {
  synonyms: string[];
  antonyms: string[];
}

interface Card {
  id: number;
  word: string;
  used: boolean;
}

// ==================== 常量 ====================
const GAME_H = 600;
const MAX_HEARTS = 3;
const ANSWER_TIMEOUT = 10000;
const CARD_COUNT_MIN = 10;
const CARD_COUNT_MAX = 15;

type PlayMode = 'synonym' | 'antonym';

// ==================== 工具 ====================
const data = synonymAntonymData as Record<string, WordEntry>;

const validSynonymWords = Object.keys(data).filter(w => data[w].synonyms.length > 0);
const validAntonymWords = Object.keys(data).filter(w => data[w].antonyms.length > 0);

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  return shuffleArray(arr).slice(0, count);
}

function generateCards(mode: PlayMode, count: number): Card[] {
  const pool = mode === 'synonym' ? validSynonymWords : validAntonymWords;
  const selected = pickRandom(pool, count);
  return selected.map((word, i) => ({ id: i, word, used: false }));
}

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
export default function RingBellGameOnline({ onExit, initialRoomId }: { onExit: () => void; initialRoomId?: string }) {
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState(initialRoomId || '');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'menu' | 'waiting' | 'playing' | 'gameover'>('menu');
  
  // 游戏状态
  const [playMode, setPlayMode] = useState<PlayMode>('synonym');
  const [cards, setCards] = useState<Card[]>([]);
  const [hearts, setHearts] = useState<number>(MAX_HEARTS);
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [currentFallingWord, setCurrentFallingWord] = useState<string>('');
  const [gamePhase, setGamePhase] = useState<'playing' | 'answering' | 'result'>('playing');
  const [answerCorrect, setAnswerCorrect] = useState<boolean | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [bellPressed, setBellPressed] = useState<boolean>(false);
  const [showCards, setShowCards] = useState<boolean>(false);
  const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
  
  // 对手状态
  const [opponentHearts, setOpponentHearts] = useState<number>(MAX_HEARTS);
  const [hasGuest, setHasGuest] = useState(false);
  const [winner, setWinner] = useState<'host' | 'guest' | 'tie' | null>(null);
  
  // Refs
  const roomPathRef = useRef<string>('');
  const firebaseRoomRef = useRef<any>(null);
  const deviceId = useRef(getDeviceId());
  const timerRef = useRef<any>(null);
  const fallingYRef = useRef(-60);
  const animFrameRef = useRef<number>(0);

  // ==================== 开始游戏 ====================
  const startGame = useCallback((mode: PlayMode) => {
    const count = CARD_COUNT_MIN + Math.floor(Math.random() * (CARD_COUNT_MAX - CARD_COUNT_MIN + 1));
    const newCards = generateCards(mode, count);
    
    setPlayMode(mode);
    setCards(newCards);
    setHearts(MAX_HEARTS);
    setScore(0);
    setCombo(0);
    setUsedWords(new Set());
    setOpponentHearts(MAX_HEARTS);
    
    // 选择第一个掉落词
    const pool = mode === 'synonym' ? validSynonymWords : validAntonymWords;
    const firstWord = pool[Math.floor(Math.random() * pool.length)];
    setCurrentFallingWord(firstWord);
    fallingYRef.current = -60;
    setGamePhase('playing');
    
    // 同步到 Firebase
    if (roomPathRef.current) {
      const myRole = role;
      const updateData: any = {
        currentFallingWord: firstWord,
        fallingY: -60,
        gamePhase: 'playing',
      };
      
      if (myRole === 'host') {
        updateData.hostCards = newCards;
        updateData.hostHearts = MAX_HEARTS;
        updateData.hostScore = 0;
      } else {
        updateData.guestCards = newCards;
        updateData.guestHearts = MAX_HEARTS;
        updateData.guestScore = 0;
      }
      
      set(ref(db, `ringBellRooms/${roomPathRef.current}/game`), updateData);
    }
  }, [role, roomId]);

  // ==================== 创建房间 ====================
  const createRoom = useCallback((mode: PlayMode) => {
    const newRoomId = generateRoomId();
    const fbRef = ref(db, `ringBellRooms/${newRoomId}`);
    
    set(fbRef, {
      hostId: deviceId.current,
      guestId: null,
      phase: 'waiting',
      playMode: mode,
      winner: null,
      hostDone: false,
      guestDone: false,
      createdAt: serverTimestamp(),
      game: null,
    });
    
    setRoomId(newRoomId);
    setRole('host');
    setPlayMode(mode);
    roomPathRef.current = newRoomId;
    firebaseRoomRef.current = fbRef;
    
    // 保存会话
    sessionStorage.setItem('ringbell_online_session', JSON.stringify({ roomId: newRoomId, role: 'host' }));
    
    // 监听房间状态
    onValue(fbRef, (snap) => {
      const data = snap.val();
      if (!data) {
        setError('房间已关闭');
        setPhase('menu');
        return;
      }
      
      setHasGuest(!!data.guestId);
      
      if (data.phase === 'playing') {
        startGame(mode);
        setPhase('playing');
      } else if (data.phase === 'gameover') {
        setPhase('gameover');
        setWinner(data.winner);
      }
      
      // 同步游戏状态
      if (data.game) {
        if (data.game.currentFallingWord) {
          setCurrentFallingWord(data.game.currentFallingWord);
        }
        if (data.game.guestHearts !== undefined) {
          setOpponentHearts(data.game.guestHearts);
        }
      }
    });
    
    setPhase('waiting');
  }, [startGame]);

  // ==================== 加入房间 ====================
  const joinRoom = useCallback(() => {
    const targetRoomId = joinRoomId.trim().toUpperCase();
    if (targetRoomId.length !== 6) {
      setError('房间号必须是6位');
      return;
    }
    
    const fbRef = ref(db, `ringBellRooms/${targetRoomId}`);
    get(fbRef).then((snap) => {
      if (!snap.exists()) {
        setError('房间不存在');
        return;
      }
      
      const data = snap.val();
      if (data.guestId) {
        setError('房间已满');
        return;
      }
      
      // 加入房间 - 设置为 playing，双方同时开始
      set(ref(db, `ringBellRooms/${targetRoomId}/guestId`), deviceId.current);
      set(ref(db, `ringBellRooms/${targetRoomId}/phase`), 'playing');
      
      setRoomId(targetRoomId);
      setRole('guest');
      setPlayMode(data.playMode || 'synonym');
      roomPathRef.current = targetRoomId;
      firebaseRoomRef.current = fbRef;
      
      // 保存会话
      sessionStorage.setItem('ringbell_online_session', JSON.stringify({ roomId: targetRoomId, role: 'guest' }));
      
      // 观众用反义（如果房主用同义）或同义（如果房主用反义）
      const guestMode: PlayMode = data.playMode === 'synonym' ? 'antonym' : 'synonym';
      startGame(guestMode);
      
      // 监听房间状态
      onValue(fbRef, (snap) => {
        const data = snap.val();
        if (!data) return;
        
        if (data.phase === 'playing') {
          setPhase('playing');
        } else if (data.phase === 'gameover') {
          setPhase('gameover');
          setWinner(data.winner);
        }
      });
      
      setPhase('playing');
    }).catch(() => {
      setError('加入房间失败');
    });
  }, [joinRoomId, startGame]);

  // ==================== 按铃 ====================
  const ringBell = useCallback(() => {
    if (gamePhase !== 'playing' || bellPressed) return;
    
    setBellPressed(true);
    setGamePhase('answering');
    setShowCards(true);
    setTimeLeft(ANSWER_TIMEOUT);
    
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, ANSWER_TIMEOUT - elapsed);
      setTimeLeft(remaining);
      
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        handleAnswerResult(false);
      }
    }, 100);
    
    // 同步到 Firebase
    if (roomPathRef.current && role) {
      const field = role === 'host' ? 'hostBellTime' : 'guestBellTime';
      set(ref(db, `ringBellRooms/${roomPathRef.current}/game/${field}`), Date.now());
    }
  }, [gamePhase, bellPressed, role, roomId]);

  // ==================== 提交答案 ====================
  const submitCard = useCallback((card: Card) => {
    if (gamePhase !== 'answering' || card.used) return;
    if (timerRef.current) clearInterval(timerRef.current);
    
    setSelectedCard(card);
    
    // 判断是否正确
    const entry = data[currentFallingWord];
    let correct = false;
    
    if (playMode === 'synonym') {
      correct = entry?.synonyms.includes(card.word) || false;
    } else {
      correct = entry?.antonyms.includes(card.word) || false;
    }
    
    handleAnswerResult(correct, card);
  }, [gamePhase, currentFallingWord, playMode]);

  // ==================== 处理答题结果 ====================
  const handleAnswerResult = useCallback((correct: boolean, card?: Card) => {
    setAnswerCorrect(correct);
    setGamePhase('result');
    
    if (correct && card) {
      // 标记卡片已使用
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, used: true } : c));
      setScore(prev => prev + 10 + combo * 2);
      setCombo(prev => prev + 1);
      
      // 检查是否所有卡片用完
      const remainingCards = cards.filter(c => c.id !== card.id && !c.used);
      if (remainingCards.length === 0) {
        // 胜利！
        setTimeout(() => {
          if (roomPathRef.current && role) {
            const field = role === 'host' ? 'hostDone' : 'guestDone';
            set(ref(db, `ringBellRooms/${roomPathRef.current}/game/${field}`), true);
            // 设置胜利者
            set(ref(db, `ringBellRooms/${roomPathRef.current}/winner`), role);
            set(ref(db, `ringBellRooms/${roomPathRef.current}/phase`), 'gameover');
          }
          setPhase('gameover');
        }, 1000);
        return;
      }
    } else {
      // 答错或超时
      setCombo(0);
      const newHearts = hearts - 1;
      setHearts(newHearts);
      
      if (newHearts <= 0) {
        // 失败
        setTimeout(() => {
          if (roomPathRef.current && role) {
            const opponentRole = role === 'host' ? 'guest' : 'host';
            set(ref(db, `ringBellRooms/${roomPathRef.current}/winner`), opponentRole);
            set(ref(db, `ringBellRooms/${roomPathRef.current}/phase`), 'gameover');
          }
          setPhase('gameover');
        }, 1000);
        return;
      }
    }
    
    // 1.5秒后继续
    setTimeout(() => {
      setAnswerCorrect(null);
      setBellPressed(false);
      setShowCards(false);
      setGamePhase('playing');
      
      // 下一个词
      const pool = playMode === 'synonym' ? validSynonymWords : validAntonymWords;
      const used = new Set([...usedWords, currentFallingWord]);
      const available = pool.filter(w => !used.has(w));
      const nextWord = available.length > 0 
        ? available[Math.floor(Math.random() * available.length)]
        : pool[Math.floor(Math.random() * pool.length)];
        
      setCurrentFallingWord(nextWord);
      setUsedWords(used);
      fallingYRef.current = -60;
    }, 1500);
  }, [cards, combo, hearts, playMode, currentFallingWord, usedWords, role, roomId]);

  // ==================== 掉落动画 ====================
  useEffect(() => {
    if (phase !== 'playing' || gamePhase !== 'playing') return;
    
    let running = true;
    const animate = () => {
      if (!running) return;
      fallingYRef.current += 1.5;
      
      if (fallingYRef.current >= GAME_H) {
        // 没人按铃，消失
        fallingYRef.current = -60;
        const pool = playMode === 'synonym' ? validSynonymWords : validAntonymWords;
        const nextWord = pool[Math.floor(Math.random() * pool.length)];
        setCurrentFallingWord(nextWord);
      }
      
      animFrameRef.current = requestAnimationFrame(animate);
    };
    
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [phase, gamePhase, playMode]);

  // ==================== 清理 ====================
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ==================== 渲染 ====================

  // 菜单界面
  if (phase === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-violet-950 flex flex-col items-center justify-center p-4 text-white">
        <motion.h1
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-4xl font-black mb-8"
        >
          🔔 按铃同反 - 联机
        </motion.h1>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <div className="grid grid-cols-2 gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => createRoom('synonym')}
              className="py-4 px-4 rounded-2xl font-bold text-base bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/30"
            >
              📗 创建同义房间
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => createRoom('antonym')}
              className="py-4 px-4 rounded-2xl font-bold text-base bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 shadow-lg shadow-rose-500/30"
            >
              📕 创建反义房间
            </motion.button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              placeholder="输入房间号"
              maxLength={6}
              className="flex-1 py-3 px-4 rounded-2xl bg-white/10 border-2 border-white/20 text-center font-mono text-2xl tracking-widest uppercase focus:outline-none focus:border-emerald-400"
            />
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={joinRoom}
              disabled={joinRoomId.length !== 6}
              className="py-3 px-6 rounded-2xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              加入
            </motion.button>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/20 border border-red-400/50 rounded-xl p-3 text-center text-red-200"
            >
              {error}
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={onExit}
            className="mt-4 py-3 px-6 rounded-2xl font-bold bg-white/10 hover:bg-white/20 transition-colors"
          >
            ← 返回主菜单
          </motion.button>
        </div>
      </div>
    );
  }

  // 等待界面
  if (phase === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-violet-950 flex flex-col items-center justify-center p-4 text-white">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-9xl mb-8"
        >
          ⏳
        </motion.div>
        <h2 className="text-3xl font-black mb-4">等待对手加入</h2>
        <div className="bg-white/10 rounded-2xl p-6 mb-8 text-center">
          <p className="text-sm text-gray-400 mb-2">房间号</p>
          <p className="text-5xl font-mono font-black tracking-widest text-emerald-400">{roomId}</p>
          <p className={`text-sm mt-3 ${playMode === 'synonym' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {playMode === 'synonym' ? '📗 同义词模式' : '📕 反义词模式'}
            {hasGuest && <span className="ml-2 text-emerald-300">✓ 对手已加入</span>}
          </p>
        </div>
        <p className="text-gray-400">分享此房间号给对手</p>
      </div>
    );
  }

  // 游戏结束界面
  if (phase === 'gameover') {
    const isWin = (role === 'host' && winner === 'host') || (role === 'guest' && winner === 'guest');
    const isTie = winner === 'tie';

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 flex flex-col items-center justify-center p-4 text-white">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-7xl mb-4"
        >
          {isTie ? '🤝' : isWin ? '🎉' : '💔'}
        </motion.div>
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={`text-3xl font-black mb-2 ${isWin ? 'text-emerald-400' : isTie ? 'text-yellow-400' : 'text-red-400'}`}
        >
          {isTie ? '平局！' : isWin ? '恭喜胜利！' : '很遗憾，失败了'}
        </motion.h2>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-gray-400 mb-6"
        >
          <p>得分：{score}</p>
          <p>剩余❤️：{hearts}</p>
          <p>对手剩余❤️：{opponentHearts}</p>
        </motion.div>

        <div className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => {
              setPhase('menu');
              setError('');
              setHasGuest(false);
              setWinner(null);
            }}
            className="py-3 px-6 rounded-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-lg"
          >
            🔄 再来一局
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={onExit}
            className="py-3 px-6 rounded-xl font-bold bg-white/10 hover:bg-white/20"
          >
            🏠 主菜单
          </motion.button>
        </div>
      </div>
    );
  }

  // 游戏主界面
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-indigo-950 to-purple-950 flex flex-col items-center text-white relative overflow-hidden">
      {/* 顶部状态栏 */}
      <div className="w-full max-w-md px-4 py-2 flex items-center justify-between bg-black/30 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold px-2 py-1 rounded-lg ${playMode === 'synonym' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            {playMode === 'synonym' ? '📗 同义词' : '📕 反义词'}
          </span>
          <span className="text-yellow-400 font-bold">{score}分</span>
          {combo > 1 && <span className="text-orange-400 text-sm">🔥×{combo}</span>}
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_HEARTS }).map((_, i) => (
            <motion.span
              key={i}
              animate={i >= hearts ? { scale: [1, 1.5, 0], opacity: [1, 1, 0] } : {}}
              className={`text-xl ${i < hearts ? 'text-red-500' : 'text-gray-600'}`}
            >
              ♥
            </motion.span>
          ))}
        </div>
      </div>

      {/* 对手状态 */}
      <div className="w-full max-w-md px-4 py-1 flex items-center justify-between text-xs text-gray-400">
        <span>对手 ❤️: {opponentHearts}</span>
        <span>房间: {roomId}</span>
      </div>

      {/* 游戏区域 */}
      <div className="relative w-full max-w-md overflow-hidden" style={{ height: GAME_H }}>
        {/* 掉落汉字 */}
        {currentFallingWord && gamePhase === 'playing' && (
          <motion.div
            key={currentFallingWord}
            className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{ top: fallingYRef.current }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="bg-gradient-to-b from-amber-400 to-amber-600 rounded-2xl px-8 py-4 shadow-2xl shadow-amber-500/30 border-2 border-amber-300/50">
              <span className="text-3xl font-black text-gray-900">{currentFallingWord}</span>
            </div>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="text-amber-400 text-2xl mt-1"
            >
              ▼
            </motion.div>
          </motion.div>
        )}

        {/* 答题中 */}
        {(gamePhase === 'answering' || gamePhase === 'result') && currentFallingWord && (
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className="absolute left-1/2 -translate-x-1/2 top-1/4 flex flex-col items-center"
          >
            <div className={`rounded-2xl px-10 py-5 shadow-2xl border-2 ${
              gamePhase === 'result'
                ? answerCorrect
                  ? 'bg-emerald-500 border-emerald-300 shadow-emerald-500/40'
                  : 'bg-red-500 border-red-300 shadow-red-500/40'
                : 'bg-gradient-to-b from-amber-400 to-amber-600 border-amber-300/50 shadow-amber-500/30'
            }`}>
              <span className="text-4xl font-black text-white">{currentFallingWord}</span>
            </div>
            <div className="text-amber-300 text-sm mt-2">
              {playMode === 'synonym' ? '同义词' : '反义词'}→？
            </div>

            {/* 倒计时 */}
            {gamePhase === 'answering' && (
              <div className="mt-2 w-40 h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-emerald-400 to-red-500"
                  style={{ width: `${(timeLeft / ANSWER_TIMEOUT) * 100}%` }}
                />
              </div>
            )}
          </motion.div>
        )}

        {/* 结果提示 */}
        <AnimatePresence>
          {gamePhase === 'result' && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className={`absolute left-1/2 -translate-x-1/2 top-1/2 px-6 py-3 rounded-2xl font-bold text-2xl shadow-xl ${
                answerCorrect
                  ? 'bg-emerald-500 text-white'
                  : 'bg-red-500 text-white'
              }`}
            >
              {answerCorrect ? '✓ 正确！' : '✗ 错误！'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 按铃按钮 */}
      <div className="w-full max-w-md px-4 py-3 flex justify-center">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          onClick={ringBell}
          disabled={gamePhase !== 'playing' || bellPressed}
          className={`relative w-24 h-24 rounded-full font-black text-3xl shadow-2xl transition-all ${
            gamePhase !== 'playing' || bellPressed
              ? 'bg-gray-600 cursor-not-allowed opacity-50'
              : 'bg-gradient-to-b from-red-400 to-red-700 hover:from-red-500 hover:to-red-800 shadow-red-500/40 active:shadow-inner'
          }`}
        >
          🔔
        </motion.button>
      </div>

      {/* 卡片区域 */}
      <div className="w-full max-w-md px-4 pb-4 flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">手上的卡片 ({cards.filter(c => !c.used).length})</span>
          <span className="text-xs text-gray-500">已用 {cards.filter(c => c.used).length}/{cards.length}</span>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {cards.map(card => (
            <motion.button
              key={card.id}
              whileHover={!card.used && showCards ? { scale: 1.1, y: -4 } : {}}
              whileTap={!card.used && showCards ? { scale: 0.9 } : {}}
              onClick={() => showCards && !card.used && submitCard(card)}
              disabled={card.used || !showCards}
              className={`relative px-3 py-2 rounded-xl font-bold text-base transition-all shadow-md ${
                card.used
                  ? 'bg-gray-700/30 text-gray-600 line-through scale-90 opacity-50'
                  : selectedCard?.id === card.id
                    ? 'bg-emerald-500 text-white ring-2 ring-emerald-300'
                    : showCards
                      ? 'bg-gradient-to-b from-indigo-500 to-indigo-700 text-white hover:from-indigo-400 hover:to-indigo-600 cursor-pointer ring-1 ring-indigo-400/50'
                      : 'bg-gray-700/50 text-gray-400 cursor-default'
              }`}
            >
              {card.word}
              {card.used && <span className="absolute -top-1 -right-1 text-xs">✓</span>}
            </motion.button>
          ))}
        </div>
      </div>

      {/* 返回按钮 */}
      <div className="w-full max-w-md px-4 pb-4">
        <button
          onClick={() => {
            if (firebaseRoomRef.current) {
              remove(firebaseRoomRef.current);
            }
            setPhase('menu');
          }}
          className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-500 text-sm transition-colors"
        >
          ← 退出游戏
        </button>
      </div>
    </div>
  );
}
