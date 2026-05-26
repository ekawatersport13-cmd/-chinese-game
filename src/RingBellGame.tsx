import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import synonymAntonymData from './data/synonym_antonym.json';
import { startSession } from './gameAnalytics';

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
const FALL_SPEED = 1.5; // 匀速掉落（像素/帧）
const WORD_START_Y = -60;
const WORD_END_Y = GAME_H;
const MAX_HEARTS = 3;
const ANSWER_TIMEOUT = 10000; // 10秒答题时间
const CARD_COUNT_MIN = 10;
const CARD_COUNT_MAX = 15;
const BELL_COOLDOWN = 1500; // 按铃冷却（ms）

type PlayMode = 'synonym' | 'antonym';
type GamePhase = 'menu' | 'playing' | 'answering' | 'result' | 'gameover' | 'victory';

// ==================== 工具 ====================
const data = synonymAntonymData as Record<string, WordEntry>;

// 获取所有有同义词或反义词的词条
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

// 生成卡片：根据模式选择有对应同义词/反义词的字
function generateCards(mode: PlayMode, count: number): Card[] {
  const pool = mode === 'synonym' ? validSynonymWords : validAntonymWords;
  const selected = pickRandom(pool, count);
  return selected.map((word, i) => ({ id: i, word, used: false }));
}

// 选择掉落词：必须至少有一个玩家手上有对应卡片
function selectFallingWord(cards: Card[], mode: PlayMode, usedWords: Set<string>): string | null {
  const activeCards = cards.filter(c => !c.used);
  if (activeCards.length === 0) return null;

  // 收集所有活跃卡片关联的词
  const candidates: string[] = [];
  for (const card of activeCards) {
    const entry = data[card.word];
    if (!entry) continue;
    // 如果卡片是同义词模式，那么掉落词应该是该卡片的同义词的反义词或另一个同义词
    // 实际逻辑：掉落词 W，卡片 C
    // 同义词模式：W 和 C 是同义词 => data[W].synonyms 包含 C 或 data[C].synonyms 包含 W
    // 反义词模式：W 和 C 是反义词 => data[W].antonyms 包含 C 或 data[C].antonyms 包含 W

    // 更简单的方式：遍历所有有效词，看是否与某张卡片有关
    const relatedWords = mode === 'synonym'
      ? entry.synonyms  // 卡片的同义词 = 可以作为掉落词
      : entry.antonyms;  // 卡片的反义词 = 可以作为掉落词

    for (const w of relatedWords) {
      if (!usedWords.has(w)) {
        candidates.push(w);
      }
    }
  }

  if (candidates.length === 0) {
    // 如果没有候选词，随机选一个有效词
    const pool = mode === 'synonym' ? validSynonymWords : validAntonymWords;
    const filtered = pool.filter(w => !usedWords.has(w));
    if (filtered.length === 0) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ==================== 主组件 ====================
export default function RingBellGame({ onExit }: { onExit?: () => void }) {
  const [playMode, setPlayMode] = useState<PlayMode>('synonym');
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [cards, setCards] = useState<Card[]>([]);
  const [currentFallingWord, setCurrentFallingWord] = useState<string>('');
  const [hearts, setHearts] = useState<number>(MAX_HEARTS);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [answerCorrect, setAnswerCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
  const [bellCooldown, setBellCooldown] = useState<boolean>(false);
  const [showCards, setShowCards] = useState<boolean>(false);
  const [bellAnimation, setBellAnimation] = useState<boolean>(false);

  const animRef = useRef<number>(0);
  const fallingYRef = useRef<number>(WORD_START_Y);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bellTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 开始游戏
  const startGame = useCallback((mode: PlayMode) => {
    startSession('ringbell', { mode });
    const count = CARD_COUNT_MIN + Math.floor(Math.random() * (CARD_COUNT_MAX - CARD_COUNT_MIN + 1));
    const newCards = generateCards(mode, count);
    const firstWord = selectFallingWord(newCards, mode, new Set());

    setPlayMode(mode);
    setCards(newCards);
    setHearts(MAX_HEARTS);
    setScore(0);
    setCombo(0);
    setSelectedCard(null);
    setAnswerCorrect(null);
    setUsedWords(new Set());
    setBellCooldown(false);
    setShowCards(false);
    fallingYRef.current = WORD_START_Y;

    if (firstWord) {
      setCurrentFallingWord(firstWord);
      setPhase('playing');
    }
  }, []);

  // 掉落动画
  useEffect(() => {
    if (phase !== 'playing') return;

    let running = true;
    const animate = () => {
      if (!running) return;
      fallingYRef.current += FALL_SPEED;

      if (fallingYRef.current >= WORD_END_Y) {
        // 没人按铃，汉字消失，下一个
        fallingYRef.current = WORD_START_Y;
        spawnNextWord();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [phase]);

  // 生成下一个掉落词
  const spawnNextWord = useCallback(() => {
    const nextWord = selectFallingWord(cards, playMode, usedWords);
    if (nextWord) {
      setCurrentFallingWord(nextWord);
      fallingYRef.current = WORD_START_Y;
    } else {
      // 没有更多词了
      setPhase('victory');
    }
  }, [cards, playMode, usedWords]);

  // 按铃
  const ringBell = useCallback(() => {
    if (phase !== 'playing' || bellCooldown) return;

    // 停止掉落
    cancelAnimationFrame(animRef.current);
    setPhase('answering');
    setShowCards(true);
    setBellAnimation(true);
    setTimeout(() => setBellAnimation(false), 500);
    setBellCooldown(true);
    bellTimeoutRef.current = setTimeout(() => setBellCooldown(false), BELL_COOLDOWN);

    // 启动答题倒计时
    setTimeLeft(ANSWER_TIMEOUT);
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, ANSWER_TIMEOUT - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        // 超时
        if (timerRef.current) clearInterval(timerRef.current);
        handleAnswerResult(false);
      }
    }, 100);
  }, [phase, bellCooldown, cards, playMode, currentFallingWord]);

  // 选择卡片提交
  const submitCard = useCallback((card: Card) => {
    if (phase !== 'answering') return;
    if (card.used) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setSelectedCard(card);

    // 判断是否正确
    const fallingEntry = data[currentFallingWord];
    const cardEntry = data[card.word];
    let correct = false;

    if (playMode === 'synonym') {
      // 同义词模式：掉落词和卡片应该是同义词
      correct = !!(fallingEntry?.synonyms.includes(card.word) || cardEntry?.synonyms.includes(currentFallingWord));
    } else {
      // 反义词模式：掉落词和卡片应该是反义词
      correct = !!(fallingEntry?.antonyms.includes(card.word) || cardEntry?.antonyms.includes(currentFallingWord));
    }

    handleAnswerResult(correct, card);
  }, [phase, currentFallingWord, playMode, cards]);

  // 处理答题结果
  const handleAnswerResult = useCallback((correct: boolean, card?: Card) => {
    setAnswerCorrect(correct);
    setPhase('result');

    if (correct && card) {
      // 标记卡片已使用
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, used: true } : c));
      setScore(prev => prev + 10 + combo * 2);
      setCombo(prev => prev + 1);

      // 检查是否所有卡片用完
      const remainingCards = cards.filter(c => c.id !== card.id && !c.used);
      if (remainingCards.length === 0) {
        setTimeout(() => setPhase('victory'), 1000);
        return;
      }
    } else {
      // 答错或超时，掉一颗心
      setCombo(0);
      const newHearts = hearts - 1;
      setHearts(newHearts);
      if (newHearts <= 0) {
        setTimeout(() => setPhase('gameover'), 1000);
        return;
      }
    }

    // 1.5秒后继续
    setTimeout(() => {
      setAnswerCorrect(null);
      setSelectedCard(null);
      setShowCards(false);
      setPhase('playing');
      fallingYRef.current = WORD_START_Y;
      spawnNextWord();
    }, 1500);
  }, [cards, hearts, combo, spawnNextWord]);

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (bellTimeoutRef.current) clearTimeout(bellTimeoutRef.current);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  // ==================== 渲染 ====================
  // 主菜单
  if (phase === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-violet-950 flex flex-col items-center justify-center p-4 text-white">
        <motion.h1
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-4xl font-black mb-2"
        >
          🔔 按铃同反
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-purple-300 mb-8 text-center"
        >
          汉字掉落，按铃抢答！
        </motion.p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => startGame('synonym')}
            className="py-4 px-6 rounded-2xl font-bold text-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/30"
          >
            📗 同义词模式
            <div className="text-xs font-normal mt-1 opacity-80">找出掉落字的同义词</div>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => startGame('antonym')}
            className="py-4 px-6 rounded-2xl font-bold text-lg bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 shadow-lg shadow-rose-500/30"
          >
            📕 反义词模式
            <div className="text-xs font-normal mt-1 opacity-80">找出掉落字的反义词</div>
          </motion.button>
        </div>

        {/* 规则说明 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 bg-white/10 rounded-2xl p-4 max-w-xs text-sm text-purple-200"
        >
          <p className="font-bold text-white mb-2">📋 游戏规则</p>
          <ul className="space-y-1">
            <li>• 汉字从上方匀速掉落</li>
            <li>• 按铃停止掉落，选卡片作答</li>
            <li>• 答对继续，答错/超时掉❤️</li>
            <li>• 卡片出完 = 胜利 🎉</li>
            <li>• ❤️ 掉完 = 失败 😢</li>
          </ul>
        </motion.div>

        {onExit && (
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={onExit}
            className="mt-6 px-6 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-sm"
          >
            ← 返回主菜单
          </motion.button>
        )}
      </div>
    );
  }

  // 游戏结束/胜利
  if (phase === 'gameover' || phase === 'victory') {
    const isVictory = phase === 'victory';
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 flex flex-col items-center justify-center p-4 text-white">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-7xl mb-4"
        >
          {isVictory ? '🎉' : '💔'}
        </motion.div>
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={`text-3xl font-black mb-2 ${isVictory ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {isVictory ? '恭喜通关！' : '游戏结束'}
        </motion.h2>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-gray-400 mb-6"
        >
          <p>得分：{score}</p>
          <p>剩余卡片：{cards.filter(c => !c.used).length}</p>
          <p>剩余❤️：{hearts}</p>
        </motion.div>

        <div className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => startGame(playMode)}
            className="py-3 px-6 rounded-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-lg"
          >
            🔄 再来一局
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => setPhase('menu')}
            className="py-3 px-6 rounded-xl font-bold bg-white/10 hover:bg-white/20"
          >
            🏠 主菜单
          </motion.button>
        </div>
      </div>
    );
  }

  // 游戏主界面
  const activeCards = cards.filter(c => !c.used);
  const usedCards = cards.filter(c => c.used);

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

      {/* 游戏区域 - 掉落 */}
      <div
        className="relative w-full max-w-md overflow-hidden"
        style={{ height: GAME_H }}
      >
        {/* 掉落汉字 */}
        {currentFallingWord && phase === 'playing' && (
          <motion.div
            key={currentFallingWord + '-' + fallingYRef.current}
            className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{ top: fallingYRef.current }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="bg-gradient-to-b from-amber-400 to-amber-600 rounded-2xl px-8 py-4 shadow-2xl shadow-amber-500/30 border-2 border-amber-300/50">
              <span className="text-3xl font-black text-gray-900">{currentFallingWord}</span>
            </div>
            {/* 下方提示箭头 */}
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="text-amber-400 text-2xl mt-1"
            >
              ▼
            </motion.div>
          </motion.div>
        )}

        {/* 答题中：掉落字停在中间 */}
        {(phase === 'answering' || phase === 'result') && currentFallingWord && (
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className="absolute left-1/2 -translate-x-1/2 top-1/4 flex flex-col items-center"
          >
            <div className={`rounded-2xl px-10 py-5 shadow-2xl border-2 ${
              phase === 'result'
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
            {phase === 'answering' && (
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
          {phase === 'result' && (
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

        {/* 掉心动画 */}
        <AnimatePresence>
          {phase === 'result' && !answerCorrect && (
            <motion.div
              initial={{ y: GAME_H / 2 - 50, opacity: 1, scale: 1 }}
              animate={{ y: GAME_H / 2 - 100, opacity: 0, scale: 2 }}
              exit={{ opacity: 0 }}
              className="absolute left-1/2 -translate-x-1/2 text-4xl"
            >
              💔
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
          disabled={phase !== 'playing' || bellCooldown}
          className={`relative w-24 h-24 rounded-full font-black text-3xl shadow-2xl transition-all ${
            phase !== 'playing' || bellCooldown
              ? 'bg-gray-600 cursor-not-allowed opacity-50'
              : 'bg-gradient-to-b from-red-400 to-red-700 hover:from-red-500 hover:to-red-800 shadow-red-500/40 active:shadow-inner'
          }`}
        >
          {bellAnimation && (
            <motion.div
              className="absolute inset-0 rounded-full border-4 border-red-300"
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
          )}
          🔔
        </motion.button>
      </div>

      {/* 卡片区域 */}
      <div className="w-full max-w-md px-4 pb-4 flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">手上的卡片 ({activeCards.length})</span>
          <span className="text-xs text-gray-500">已用 {usedCards.length}/{cards.length}</span>
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
            cancelAnimationFrame(animRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
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
