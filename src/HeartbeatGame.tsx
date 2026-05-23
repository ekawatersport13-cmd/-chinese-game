import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import chainData from './data/chain_dictionary.json';

// ==================== 类型 ====================
interface ChainWord {
  word: string;
  pinyin: string;
  meaning: string;
  hsk?: number;
}

interface Stone {
  id: number;
  word: string;
  pinyin: string;
  meaning: string;
  hsk: number;
  lane: 'left' | 'center' | 'right';
  x: number;
  y: number;
  speed: number;
  wobble: number;
  wobbleSpeed: number;
  wobblePhase: number;
  alive: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  size: number;
}

interface DodgeEvent {
  id: number;
  lane: 'left' | 'center' | 'right';
  x: number;
  y: number;
  time: number;
}

interface LaneHint {
  word: string;
  pinyin: string;
  meaning: string;
}

// ==================== 常量 ====================
const GAME_H = 520;
const GAME_W = 380;
const PLAYER_H = 56;
const PLAYER_W = 48;
const PLAYER_Y = GAME_H - PLAYER_H - 10;
const STONE_W = 100;
const STONE_H = 58;

// 三通道X坐标
const LANES = [
  35,                        // left
  (GAME_W - STONE_W) / 2,    // center
  GAME_W - STONE_W - 35,     // right
];

const LANE_COLORS = {
  left:   { bg: 'from-cyan-600 to-blue-700',   border: 'border-cyan-400/60',   text: 'text-cyan-200/80',   glow: '#22d3ee',   label: '← 左', short: 'L' },
  center: { bg: 'from-amber-600 to-orange-700', border: 'border-amber-400/60',  text: 'text-amber-200/80',  glow: '#fbbf24',   label: '中',  short: 'C' },
  right:  { bg: 'from-rose-600 to-pink-700',   border: 'border-rose-400/60',   text: 'text-rose-200/80',   glow: '#fb7185',   label: '右 →', short: 'R' },
};

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

const LANES_ARR: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];

// ==================== 主组件 ====================
export default function HeartbeatGame({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('heartbeat_hs') || '0');
  });
  const [lives, setLives] = useState(3);
  const [difficulty, setDifficulty] = useState(1);

  const [playerLane, setPlayerLane] = useState<0 | 1 | 2>(1);
  const [stones, setStones] = useState<Stone[]>([]);
  const [input, setInput] = useState('');
  const [particles, setParticles] = useState<Particle[]>([]);
  const [dodgeEvents, setDodgeEvents] = useState<DodgeEvent[]>([]);
  const [shake, setShake] = useState(false);
  const [flashRed, setFlashRed] = useState(false);
  const [lastDodge, setLastDodge] = useState<'left' | 'center' | 'right' | null>(null);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [dodgeScoreAnim, setDodgeScoreAnim] = useState<{val:number,x:number,y:number,time:number}|null>(null);

  // 三个通道的底部提示
  const [laneHints, setLaneHints] = useState<Record<string, LaneHint|null>>({
    left: null, center: null, right: null
  });

  const stoneIdRef = useRef(0);
  const particleIdRef = useRef(0);
  const dodgeIdRef = useRef(0);
  const frameRef = useRef<number>(0);
  const lastSpawnRef = useRef(0);
  const animRef = useRef<{ stones: Stone[], playerLane: 0 | 1 | 2 }>({
    stones: [], playerLane: 1
  });
  const inputRef = useRef('');
  const hintsRef = useRef<Record<string, LaneHint|null>>({ left: null, center: null, right: null });
  const usedWordsRef = useRef<Set<string>>(new Set());

  useEffect(() => { inputRef.current = input; }, [input]);
  useEffect(() => { hintsRef.current = laneHints; }, [laneHints]);

  // 获取未使用过的词（避免重复）
  const getUnusedWord = useCallback((diffOverride?: number): ChainWord => {
    const diff = diffOverride !== undefined ? diffOverride : difficulty;
    const pool = getWordsByLevel(Math.min(diff, 11));
    if (pool.length === 0) {
      usedWordsRef.current.clear();
      return LEFT_WORDS[Math.floor(Math.random() * LEFT_WORDS.length)] || { word: '漂亮', pinyin: 'piàoliang', meaning: 'cantik', hsk: 1 };
    }
    const unused = pool.filter(w => !usedWordsRef.current.has(w.word));
    if (unused.length === 0) {
      usedWordsRef.current.clear();
      const w = pool[Math.floor(Math.random() * pool.length)];
      usedWordsRef.current.add(w.word);
      return w;
    }
    const w = unused[Math.floor(Math.random() * unused.length)];
    usedWordsRef.current.add(w.word);
    return w;
  }, [difficulty]);

  // ==================== 粒子效果 ====================
  const spawnParticles = useCallback((x: number, y: number, color: string, count: number) => {
    const newParts: Particle[] = [];
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

  const spawnDodgeText = useCallback((lane: 'left' | 'center' | 'right', x: number) => {
    setDodgeEvents(prev => [...prev.slice(-5), {
      id: dodgeIdRef.current++,
      lane,
      x: x + PLAYER_W / 2,
      y: PLAYER_Y - 20,
      time: Date.now(),
    }]);
  }, []);

  // ==================== 游戏循环 ====================
  const gameLoop = useCallback((ts: number) => {
    if (phase !== 'playing') return;

    const state = animRef.current;
    const speedMultiplier = 1 + (difficulty - 1) * 0.08;
    const baseSpeed = 1.0 * speedMultiplier;
    const spawnInterval = Math.max(2200 - (difficulty - 1) * 100, 1000);

    // Spawn stones
    if (ts - lastSpawnRef.current > spawnInterval) {
      lastSpawnRef.current = ts;
      const word = getUnusedWord();
      const laneIdx = Math.floor(Math.random() * 3);
      const lane = LANES_ARR[laneIdx];
      const newStone: Stone = {
        id: stoneIdRef.current++,
        word: word.word,
        pinyin: word.pinyin,
        meaning: word.meaning,
        hsk: word.hsk || 1,
        lane,
        x: LANES[laneIdx],
        y: -STONE_H,
        speed: baseSpeed,
        wobble: 0,
        wobbleSpeed: 2 + Math.random() * 2,
        wobblePhase: Math.random() * Math.PI * 2,
        alive: true,
      };
      state.stones = [...state.stones, newStone];

      // 如果该通道还没有提示，生成一个新提示
      if (!hintsRef.current[lane]) {
        const hint: LaneHint = {
          word: word.word,
          pinyin: word.pinyin,
          meaning: word.meaning,
        };
        setLaneHints(prev => ({ ...prev, [lane]: hint }));
      }
    }

    // Update stones
    let hit = false;
    let dodgedCount = 0;
    state.stones = state.stones
      .map(s => {
        if (!s.alive) return s;
        const newY = s.y + s.speed;
        const wobble = Math.sin(s.wobblePhase + ts * 0.003 * s.wobbleSpeed) * 3;

        const stoneBottom = newY + STONE_H;
        const playerTop = PLAYER_Y;
        const stoneLaneIdx = LANES_ARR.indexOf(s.lane);

        if (stoneBottom >= playerTop && stoneBottom <= playerTop + PLAYER_H + 10) {
          if (stoneLaneIdx === state.playerLane) {
            hit = true;
            return { ...s, alive: false, y: newY };
          }
        }

        if (newY > PLAYER_Y + PLAYER_H && s.alive) {
          dodgedCount++;
          return { ...s, alive: false, y: newY };
        }

        return { ...s, y: newY, wobble };
      })
      .filter(s => s.y < GAME_H + 50 && s.alive);

    if (hit) {
      setLives(prev => {
        const next = prev - 1;
        if (next <= 0) {
          setPhase('gameover');
          setHighScore(hs => {
            const newHs = Math.max(hs, score);
            localStorage.setItem('heartbeat_hs', String(newHs));
            return newHs;
          });
        }
        return next;
      });
      setShake(true);
      setFlashRed(true);
      setTimeout(() => setShake(false), 300);
      setTimeout(() => setFlashRed(false), 200);
      setCombo(0);
      state.stones = [];
    }

    if (dodgedCount > 0) {
      const pts = dodgedCount * 10 * difficulty;
      setScore(prev => prev + pts);
      setCombo(prev => {
        const c = prev + dodgedCount;
        setMaxCombo(mc => Math.max(mc, c));
        return c;
      });
      setScore(prev => {
        const newLvl = Math.floor(prev / 500) + 1;
        setDifficulty(d => Math.min(d + (newLvl > d ? 1 : 0), 11));
        return prev;
      });
    }

    setStones([...state.stones]);

    frameRef.current = requestAnimationFrame(gameLoop);
  }, [phase, difficulty, score]);

  useEffect(() => {
    if (phase === 'playing') {
      lastSpawnRef.current = performance.now();
      frameRef.current = requestAnimationFrame(gameLoop);
    }
    return () => cancelAnimationFrame(frameRef.current);
  }, [phase, gameLoop]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      setParticles(prev => prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.15,
          life: p.life - 0.04,
        }))
        .filter(p => p.life > 0)
      );
      setDodgeEvents(prev => prev.filter(e => Date.now() - e.time < 800));
      // clear dodge score anim
      setDodgeScoreAnim(prev => {
        if (prev && Date.now() - prev.time > 1200) return null;
        return prev;
      });
    }, 16);
    return () => clearInterval(id);
  }, [phase]);

  // ==================== 打字逻辑（单输入框） ====================
  const checkInput = useCallback(() => {
    if (phase !== 'playing') return;
    const val = inputRef.current.trim();
    if (val.length === 0) return;

    // 匹配底部提示（看提示打字 → 移动到对应通道）
    let matchedLane: 'left' | 'center' | 'right' | null = null;
    for (const lane of LANES_ARR) {
      const hint = hintsRef.current[lane];
      if (hint && hint.word === val) {
        matchedLane = lane;
        break;
      }
    }

    if (matchedLane) {
      const laneIdx = LANES_ARR.indexOf(matchedLane);
      animRef.current.playerLane = laneIdx as 0 | 1 | 2;
      setPlayerLane(laneIdx as 0 | 1 | 2);

      // 消灭该通道上所有活跃石头
      let killed = 0;
      animRef.current.stones = animRef.current.stones.map(s => {
        if (s.alive && s.lane === matchedLane) {
          killed++;
          return { ...s, alive: false };
        }
        return s;
      });

      const color = LANE_COLORS[matchedLane].glow;
      const laneX = LANES[laneIdx];
      spawnParticles(laneX, PLAYER_Y, color, 14);
      spawnDodgeText(matchedLane, laneX);
      setLastDodge(matchedLane);
      setTimeout(() => setLastDodge(null), 300);
      setInput('');
      inputRef.current = '';

      // 成功躲避加分（+50 x 难度 x 消灭石头数，至少1个）
      const pts = 50 * difficulty * Math.max(killed, 1);
      setScore(prev => prev + pts);
      setDodgeScoreAnim({ val: pts, x: laneX + STONE_W/2, y: PLAYER_Y - 30, time: Date.now() });

      // 生成新提示替换旧的
      const newWord = getUnusedWord();
      setLaneHints(prev => ({
        ...prev,
        [matchedLane]: {
          word: newWord.word,
          pinyin: newWord.pinyin,
          meaning: newWord.meaning,
        }
      }));
    }
  }, [phase, difficulty, spawnParticles, spawnDodgeText]);

  useEffect(() => {
    const id = setInterval(checkInput, 80);
    return () => clearInterval(id);
  }, [checkInput]);

  // ==================== 游戏控制 ====================
  const startGame = (lvl: number) => {
    setPhase('playing');
    setScore(0);
    setLives(3);
    setDifficulty(lvl);
    setCombo(0);
    setMaxCombo(0);
    setStones([]);
    setParticles([]);
    setDodgeEvents([]);
    setDodgeScoreAnim(null);
    setPlayerLane(1);
    setInput('');
    setLaneHints({ left: null, center: null, right: null });
    animRef.current = { stones: [], playerLane: 1 };
    inputRef.current = '';
    hintsRef.current = { left: null, center: null, right: null };
    usedWordsRef.current.clear();

    // 预生成3个提示
    ['left','center','right'].forEach((lane, i) => {
      setTimeout(() => {
        const word = getUnusedWord(lvl);
        setLaneHints(prev => ({
          ...prev,
          [lane]: { word: word.word, pinyin: word.pinyin, meaning: word.meaning }
        }));
      }, i * 100);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setPhase('menu');
      cancelAnimationFrame(frameRef.current);
    }
  };

  // ==================== 渲染 ====================
  const activeStones = stones.filter(s => s.alive);

  // MENU
  if (phase === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-red-950 to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900/90 rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-red-800/40"
        >
          <motion.div
            className="text-center mb-8"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="text-6xl mb-3">💓</div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-pink-400 to-red-500">
              心跳模式
            </h1>
            <p className="text-red-300/70 text-sm mt-2">Heartbeat Challenge</p>
          </motion.div>

          <div className="bg-red-900/30 rounded-2xl p-4 mb-6 border border-red-700/40">
            <h3 className="text-red-300 font-bold text-sm mb-3">🎮 游戏规则</h3>
            <div className="space-y-2 text-xs text-gray-300">
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">1</span>
                <span>石头从上方掉落，底部 L/C/R 显示拼音或印尼语提示</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">2</span>
                <span>石头有左、中、右三个通道</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">3</span>
                <span>看到提示 → 打出对应汉字 → 角色自动移动到该通道躲避！</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-400 font-bold">4</span>
                <span>被石头砸中 = 失去一条命 ❌</span>
              </div>
            </div>
          </div>

          {highScore > 0 && (
            <div className="text-center text-yellow-400 text-sm mb-4 font-bold">
              🏆 最高分：{highScore}
            </div>
          )}

          <p className="text-center text-gray-400 text-xs mb-3">选择难度（HSK级别）</p>
          <div className="grid grid-cols-4 gap-2 mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(lvl => (
              <motion.button
                key={lvl}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => startGame(lvl)}
                className="py-2 rounded-lg font-bold text-sm transition-all shadow-lg"
                style={{
                  background: `linear-gradient(135deg,
                    hsl(${360 - lvl * 35}, 70%, 45%),
                    hsl(${360 - lvl * 35}, 70%, 35%))`,
                  color: 'white',
                }}
              >
                HSK{lvl}
              </motion.button>
            ))}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => startGame(11)}
              className="py-2 rounded-lg font-bold text-xs bg-gradient-to-r from-red-600 to-pink-600 text-white shadow-lg"
            >
              全部
            </motion.button>
          </div>

          <button
            onClick={onExit}
            className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-all"
          >
            ← 返回主菜单
          </button>
        </motion.div>
      </div>
    );
  }

  // GAME OVER
  if (phase === 'gameover') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-red-950 to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900/90 rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-red-800/40 text-center"
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.5 }}
            className="text-7xl mb-4"
          >
            💀
          </motion.div>
          <h2 className="text-2xl font-black text-red-400 mb-2">游戏结束！</h2>
          <p className="text-gray-400 text-sm mb-6">你被石头砸中了...</p>

          <div className="bg-gray-800/60 rounded-2xl p-4 mb-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">分数</span>
              <span className="text-yellow-400 font-bold text-xl">{score}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">最高分</span>
              <span className="text-yellow-300 font-bold">{Math.max(score, highScore)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">难度</span>
              <span className="text-red-400 font-bold">HSK {difficulty}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">最高连击</span>
              <span className="text-pink-400 font-bold">x{maxCombo}</span>
            </div>
          </div>

          {score >= highScore && score > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-yellow-400 font-black text-lg mb-4"
            >
              🎉 新纪录！🎉
            </motion.div>
          )}

          <div className="space-y-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => startGame(difficulty)}
              className="w-full py-4 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl font-bold text-lg shadow-lg"
            >
              再来一局
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setPhase('menu')}
              className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold transition-all"
            >
              更换难度
            </motion.button>
            <button
              onClick={onExit}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-xl text-sm transition-all"
            >
              返回主菜单
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // PLAYING
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-red-950/60 to-gray-900 flex flex-col items-center justify-center p-2">
      {/* HUD */}
      <div className="w-full max-w-md flex justify-between items-center mb-2 px-1">
        <button
          onClick={() => { cancelAnimationFrame(frameRef.current); setPhase('menu'); }}
          className="text-gray-500 hover:text-white text-xs transition-colors"
        >
          ✕ 退出
        </button>
        <div className="flex items-center gap-4">
          <motion.span
            key={score}
            animate={{ scale: [1, 1.2, 1] }}
            className="text-yellow-400 font-black text-lg"
          >
            {score}
          </motion.span>
          <span className="text-xs text-gray-500">HSK{difficulty}</span>
          <div className="flex gap-1">
            {[...Array(3)].map((_, i) => (
              <span key={i} className={`text-lg transition-all ${i < lives ? 'opacity-100' : 'opacity-20'}`}>
                {i < lives ? '❤️' : '🖤'}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Combo */}
      <AnimatePresence>
        {combo >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center mb-1"
          >
            <span className="text-pink-400 font-black text-sm">
              🔥 连击 x{combo}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Area */}
      <motion.div
        animate={shake ? { x: [-6, 6, -4, 4, 0] } : {}}
        transition={{ duration: 0.3 }}
        className={`relative overflow-hidden rounded-2xl border-2 shadow-2xl ${
          flashRed ? 'border-red-500 bg-red-950/40' : 'border-red-900/60 bg-gray-900/80'
        }`}
        style={{ width: GAME_W, height: GAME_H }}
      >
        {/* Danger zone line */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-red-500/40"
          style={{ top: PLAYER_Y - 5 }}
        />

        {/* Lane guides */}
        {LANES_ARR.map((lane, i) => (
          <div
            key={lane}
            className={`absolute top-0 bottom-0 w-px opacity-10 ${
              lane === 'left' ? 'bg-cyan-400' : lane === 'center' ? 'bg-amber-400' : 'bg-rose-400'
            }`}
            style={{ left: LANES[i] + STONE_W / 2 }}
          />
        ))}

        {/* Background particles */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-red-500/20 rounded-full"
              style={{
                left: `${(i * 19 + 5) % 100}%`,
                top: `${(i * 37 + 10) % 100}%`,
              }}
              animate={{ opacity: [0.1, 0.4, 0.1], y: [0, -10, 0] }}
              transition={{ duration: 2 + (i % 3), repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </div>

        {/* Falling Stones - 石头上不显示拼音/意思 */}
        <AnimatePresence>
          {activeStones.map(s => {
            const colors = LANE_COLORS[s.lane];
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, scale: 0.5, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: s.y, x: s.x + s.wobble }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: 'linear' }}
                className={`absolute flex flex-col items-center justify-center rounded-xl shadow-lg font-bold bg-gradient-to-br ${colors.bg} ${colors.border} border-2`}
                style={{ width: STONE_W, height: STONE_H }}
              >
                {/* 只显示通道标识 */}
                <div className={`text-sm font-black ${colors.text}`}>
                  {colors.label}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Particles */}
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              background: p.color,
              opacity: p.life,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            }}
          />
        ))}

        {/* Dodge text */}
        {dodgeEvents.map(e => {
          const age = Date.now() - e.time;
          const opacity = 1 - age / 800;
          const yOffset = age * 0.05;
          const colors = LANE_COLORS[e.lane];
          return (
            <div
              key={e.id}
              className="absolute pointer-events-none font-black text-lg"
              style={{
                left: e.x - 20,
                top: e.y - yOffset,
                opacity: Math.max(0, opacity),
                color: colors.glow,
                textShadow: `0 0 10px ${colors.glow}`,
              }}
            >
              {e.lane === 'left' ? '← 躲!' : e.lane === 'right' ? '躲 →' : '↑ 躲!'}
            </div>
          );
        })}

        {/* Dodge score popup */}
        {dodgeScoreAnim && (
          <motion.div
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -40, scale: 1.3 }}
            transition={{ duration: 1 }}
            className="absolute pointer-events-none font-black text-yellow-400 text-xl"
            style={{
              left: dodgeScoreAnim.x - 15,
              top: dodgeScoreAnim.y,
            }}
          >
            +{dodgeScoreAnim.val}
          </motion.div>
        )}

        {/* Player character */}
        <motion.div
          animate={{
            x: LANES[playerLane] + (STONE_W - PLAYER_W) / 2,
            y: PLAYER_Y,
            scaleX: lastDodge ? 1.15 : 1,
            scaleY: lastDodge ? 0.85 : 1,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className={`absolute flex flex-col items-center justify-center rounded-xl shadow-xl border-2 ${
            lastDodge === 'left'
              ? 'bg-gradient-to-br from-cyan-400 to-cyan-600 border-cyan-300'
              : lastDodge === 'center'
                ? 'bg-gradient-to-br from-amber-400 to-orange-600 border-amber-300'
                : lastDodge === 'right'
                  ? 'bg-gradient-to-br from-rose-400 to-pink-600 border-rose-300'
                  : 'bg-gradient-to-br from-gray-600 to-gray-800 border-gray-500'
          }`}
          style={{ width: PLAYER_W, height: PLAYER_H }}
        >
          <div className="text-2xl">🧑</div>
          <div className={`text-xs font-bold ${
            lastDodge === 'left' ? 'text-cyan-100' : lastDodge === 'center' ? 'text-amber-100' : lastDodge === 'right' ? 'text-rose-100' : 'text-gray-300'
          }`}>你</div>
        </motion.div>

        {/* Lane labels at bottom */}
        {LANES_ARR.map((lane, i) => {
          const colors = LANE_COLORS[lane];
          return (
            <div
              key={lane}
              className="absolute flex flex-col items-center"
              style={{
                bottom: 2,
                left: LANES[i] + STONE_W / 2,
                transform: 'translateX(-50%)',
                width: STONE_W - 10,
              }}
            >
              {/* L/C/R 标签 */}
              <div className={`text-xs font-black opacity-40 ${
                lane === 'left' ? 'text-cyan-400' : lane === 'center' ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {colors.short}
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Lane Hints - 输入框上方显示拼音+印尼语 */}
      <div className="w-full max-w-md mt-2 px-1">
        <div className="flex justify-center gap-2">
          {LANES_ARR.map((lane) => {
            const hint = laneHints[lane];
            return (
              <div
                key={lane}
                className={`flex-1 rounded-lg border-2 px-2 py-1.5 text-center min-h-[48px] flex flex-col justify-center ${
                  lane === 'left'
                    ? 'border-cyan-500/60 bg-cyan-950/40'
                    : lane === 'center'
                    ? 'border-amber-500/60 bg-amber-950/40'
                    : 'border-rose-500/60 bg-rose-950/40'
                }`}
              >
                {hint ? (
                  <>
                    <div className={`text-xs font-bold leading-tight ${
                      lane === 'left' ? 'text-cyan-200' : lane === 'center' ? 'text-amber-200' : 'text-rose-200'
                    }`}>
                      {hint.pinyin}
                    </div>
                    <div className={`text-[10px] leading-tight opacity-80 ${
                      lane === 'left' ? 'text-cyan-300' : lane === 'center' ? 'text-amber-300' : 'text-rose-300'
                    }`}>
                      {hint.meaning}
                    </div>
                  </>
                ) : (
                  <div className="text-gray-600 text-xs">...</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Single Input Area */}
      <div className="w-full max-w-md mt-2 px-1">
        <div className="relative">
          <div className="text-white text-xs font-bold mb-1 flex items-center gap-1">
            <span>⌨️</span> 输入汉字移动角色
          </div>
          <div className={`relative rounded-xl border-2 transition-all ${
            input.length > 0
              ? 'border-white bg-gray-800 shadow-[0_0_20px_rgba(255,255,255,0.15)]'
              : 'border-gray-700 bg-gray-800/60'
          }`}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="在这里打汉字..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-transparent px-3 py-3 text-white text-sm font-bold outline-none placeholder-gray-600 text-center"
              autoFocus
            />
          </div>
        </div>
      </div>

      {/* Progress hint */}
      <div className="w-full max-w-md mt-2 px-1">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>💡 提示：看上方三个框的拼音+印尼语 → 打出对应汉字 → 角色移动躲避（+{50 * difficulty}分）</span>
          <span>ESC退出</span>
        </div>
      </div>
    </div>
  );
}
