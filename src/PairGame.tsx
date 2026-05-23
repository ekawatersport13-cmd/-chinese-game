import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import hskData from './data/hsk_vocabulary.json';
import { startSession, logWord, endSession } from './gameAnalytics';

// ==================== 类型 ===================
interface VocabWord {
  word: string;
  pinyin: string;
  indonesian: string;
  components: string[];
  level?: number;
}

interface CardItem {
  id: string;
  type: 'pinyin' | 'hanzi' | 'indonesian';
  value: string;
  word: string; // 关联的词（用于配对验证）
  matched: boolean;
  selected: boolean;
}

// ==================== 数据工具 ===================
const getWordsByLevel = (level: number, count: number): VocabWord[] => {
  const key = `hsk${level}`;
  const words = ((hskData as any)[key] || []) as any[];
  // 过滤掉多字词（只保留单字，配对模式更适合单字）
  const valid = words
    .map((w: any) => ({ ...w, level }))
    .filter((w: VocabWord) => w.word.length === 1);
  if (valid.length === 0) return [];
  return [...valid].sort(() => Math.random() - 0.5).slice(0, Math.min(count, valid.length));
};

// ==================== 组件 ===================
export default function PairGame({ onExit }: { onExit: () => void }) {
  // 配置状态
  const [config, setConfig] = useState<{ hskLevel?: number; setCount?: number }>({});
  const [gameStarted, setGameStarted] = useState(false);

  // 游戏状态
  const [cards, setCards] = useState<CardItem[]>([]);
  const [selectedCards, setSelectedCards] = useState<CardItem[]>([]);
  const [matchedCount, setMatchedCount] = useState(0);
  const [score, setScore] = useState(0);
  const [correctMatches, setCorrectMatches] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [combo, setCombo] = useState(0);
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [totalSets, setTotalSets] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 可用的 HSK 级别
  const availableLevels = [1, 2, 3, 4, 5, 6].filter(
    (lv) => ((hskData[`hsk${lv}` as keyof typeof hskData] as any[]) || []).length > 0
  );

  // ========== 开始游戏 ==========
  const startGame = useCallback((hskLevel: number, setCount: number) => {
    startSession('pair', { difficulty: hskLevel, settings: { setCount } });
    const words = getWordsByLevel(hskLevel, setCount);
    if (words.length === 0) return;

    // 生成所有卡片：每套3张（拼音、汉字、印尼语），全部打乱
    const allCards: CardItem[] = [];
    words.forEach((word, idx) => {
      allCards.push({ id: `p-${idx}`, type: 'pinyin', value: word.pinyin, word: word.word, matched: false, selected: false });
      allCards.push({ id: `h-${idx}`, type: 'hanzi', value: word.word, word: word.word, matched: false, selected: false });
      allCards.push({ id: `i-${idx}`, type: 'indonesian', value: word.indonesian, word: word.word, matched: false, selected: false });
    });

    // 打乱顺序
    const shuffled = [...allCards].sort(() => Math.random() - 0.5);

    setCards(shuffled);
    setSelectedCards([]);
    setMatchedCount(0);
    setScore(0);
    setCorrectMatches(0);
    setWrongAttempts(0);
    setTimer(0);
    setTimerRunning(true);
    setGameFinished(false);
    setCombo(0);
    setFeedback('idle');
    setTotalSets(words.length);
    setGameStarted(true);
  }, []);

  // ========== 计时器 ==========
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ========== 选择卡片 ==========
  const selectCard = useCallback((card: CardItem) => {
    if (card.matched) return;

    // 如果点击的是已选中的卡片，取消选择
    if (card.selected) {
      setSelectedCards((prev) => prev.filter((c) => c.id !== card.id));
      setCards((prev) =>
        prev.map((c) => (c.id === card.id ? { ...c, selected: false } : c))
      );
      return;
    }

    // 如果正在显示错误反馈，先清除反馈和之前的选择
    if (feedback === 'wrong') {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setCards((prev) =>
        prev.map((c) => ({ ...c, selected: false }))
      );
      setSelectedCards([]);
      setFeedback('idle');
    }

    if (feedback !== 'idle') return;
    if (selectedCards.length >= 3) return;

    const newSelected = [...selectedCards, card];
    setSelectedCards(newSelected);

    // 标记选中状态
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, selected: true } : c))
    );

    // 选满3张时检查
    if (newSelected.length === 3) {
      const allSameWord = newSelected.every((c) => c.word === newSelected[0].word);
      const allDifferentTypes = new Set(newSelected.map((c) => c.type)).size === 3;
      const isCorrect = allSameWord && allDifferentTypes;

      if (isCorrect) {
        // 正确：标记为已匹配，清除选中
        setCards((prev) =>
          prev.map((c) =>
            newSelected.some((s) => s.id === c.id) ? { ...c, matched: true, selected: false } : c
          )
        );
        const bonus = Math.min(combo, 5) * 2;
        setScore((prev) => prev + 10 + bonus);
        setCorrectMatches((prev) => prev + 1);
        setCombo((prev) => prev + 1);
        setMatchedCount((prev) => prev + 1);
        setFeedback('correct');
        logWord(newSelected[0].word, true, newSelected[0].value, newSelected[2].value);

        // 检查是否全部配对完成
        const newMatchedCount = matchedCount + 1;
        if (newMatchedCount >= totalSets) {
          setTimeout(() => {
            setTimerRunning(false);
            endSession({
              score: score + 10 + bonus,
              correct: correctMatches + 1,
              wrong: wrongAttempts,
              extra: { totalSets, timeSeconds: timer },
            });
            setGameFinished(true);
          }, 800);
        } else {
          // 清除反馈
          feedbackTimerRef.current = setTimeout(() => {
            setFeedback('idle');
            setSelectedCards([]);
          }, 1200);
        }
      } else {
        // 错误：清除选中状态
        setWrongAttempts((prev) => prev + 1);
        setCombo(0);
        setFeedback('wrong');
        logWord(newSelected[0].word, false);

        // 延迟后翻回
        feedbackTimerRef.current = setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              newSelected.some((s) => s.id === c.id) ? { ...c, selected: false } : c
            )
          );
          setFeedback('idle');
          setSelectedCards([]);
        }, 1000);
      }
    }
  }, [selectedCards, feedback, combo, matchedCount, totalSets, score, correctMatches, wrongAttempts, timer]);

  // ========== 播放发音 ==========
  const playSound = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 0.8;
      u.pitch = 1.1;
      window.speechSynthesis.speak(u);
    }
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // ==================== 配置界面 ====================
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-900 via-pink-900 to-purple-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 sm:p-8 max-w-md w-full"
        >
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="text-5xl sm:text-6xl mb-3"
            >
              🎯
            </motion.div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-rose-600 to-purple-600 bg-clip-text text-transparent mb-2">
              配对模式
            </h1>
            <p className="text-gray-500 text-sm">拼音 · 汉字 · 印尼语 三合一配对</p>
          </div>

          {/* HSK 级别选择 */}
          <div className="mb-6">
            <p className="text-center text-sm text-gray-600 mb-3 font-medium">选择 HSK 级别</p>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {availableLevels.map((lv) => (
                <motion.button
                  key={lv}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setConfig((prev) => ({ ...prev, hskLevel: lv }))}
                  className={`py-3 px-2 rounded-xl font-bold text-sm sm:text-base transition-all shadow-lg ${
                    config?.hskLevel === lv
                      ? 'bg-gradient-to-r from-rose-500 to-purple-500 text-white ring-2 ring-rose-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  HSK {lv}
                </motion.button>
              ))}
            </div>
          </div>

          {/* 套数选择 */}
          <div className="mb-6">
            <p className="text-center text-sm text-gray-600 mb-3 font-medium">选择套数</p>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {[5, 10, 15, 20].map((count) => (
                <motion.button
                  key={count}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setConfig((prev) => ({ ...prev, setCount: count }))}
                  className={`py-3 px-2 rounded-xl font-bold text-sm sm:text-base transition-all shadow-lg ${
                    config?.setCount === count
                      ? 'bg-gradient-to-r from-rose-500 to-purple-500 text-white ring-2 ring-rose-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {count}套
                </motion.button>
              ))}
            </div>
          </div>

          {/* 开始按钮 */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (config?.hskLevel && config?.setCount) {
                startGame(config.hskLevel, config.setCount);
              }
            }}
            disabled={!config?.hskLevel || !config?.setCount}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${
              config?.hskLevel && config?.setCount
                ? 'bg-gradient-to-r from-rose-500 to-purple-500 text-white hover:from-rose-600 hover:to-purple-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            🎮 开始配对
          </motion.button>

          <button
            onClick={onExit}
            className="w-full mt-3 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-all"
          >
            ← 返回首页
          </button>

          {/* 规则说明 */}
          <div className="mt-6 bg-gradient-to-r from-rose-50 to-purple-50 rounded-2xl p-4">
            <h3 className="font-bold text-gray-800 mb-2 text-sm">📖 配对规则</h3>
            <ul className="text-xs sm:text-sm text-gray-600 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                选择 HSK 级别和套数（如 10 套 = 30 张卡片）
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                所有卡片打乱显示在网格中
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                点击翻开卡片，找出同一汉字的拼音+汉字+印尼语
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                3 张全部配对正确才能消除，全部消除后游戏结束
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                配对错误卡片会翻回，连续正确有连击加分
              </li>
            </ul>
          </div>
        </motion.div>
      </div>
    );
  }

  // ==================== 游戏结束 ====================
  if (gameFinished) {
    const totalAttempts = correctMatches + wrongAttempts;
    const accuracy = totalAttempts > 0 ? Math.round((correctMatches / totalAttempts) * 100) : 0;
    const rating = accuracy >= 90 ? '🌟' : accuracy >= 70 ? '👍' : accuracy >= 50 ? '💪' : '📚';

    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-900 via-pink-900 to-purple-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 sm:p-8 max-w-md w-full text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="text-6xl sm:text-7xl mb-4"
          >
            {rating}
          </motion.div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 bg-gradient-to-r from-rose-600 to-purple-600 bg-clip-text text-transparent">
            配对完成！
          </h2>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="text-2xl sm:text-3xl font-bold text-blue-600">{score}</div>
              <div className="text-xs text-gray-500">得分</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <div className="text-2xl sm:text-3xl font-bold text-green-600">{correctMatches}</div>
              <div className="text-xs text-gray-500">配对成功</div>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <div className="text-2xl sm:text-3xl font-bold text-red-600">{wrongAttempts}</div>
              <div className="text-xs text-gray-500">配对失败</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-4">
              <div className="text-2xl sm:text-3xl font-bold text-purple-600">{formatTime(timer)}</div>
              <div className="text-xs text-gray-500">用时</div>
            </div>
          </div>

          <div className="mb-6 p-4 bg-gradient-to-r from-rose-50 to-purple-50 rounded-xl">
            <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-rose-600 to-purple-600 bg-clip-text text-transparent">
              {accuracy}%
            </div>
            <div className="text-gray-500 text-sm">正确率</div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                if (config.hskLevel && config.setCount) {
                  startGame(config.hskLevel, config.setCount);
                }
              }}
              disabled={!config.hskLevel || !config.setCount}
              className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg ${
                config.hskLevel && config.setCount
                  ? 'bg-gradient-to-r from-rose-500 to-purple-500 text-white hover:from-rose-600 hover:to-purple-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              再来一局
            </button>
            <button
              onClick={onExit}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all"
            >
              返回首页
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ==================== 游戏中 ====================
  const progress = totalSets > 0 ? (matchedCount / totalSets) * 100 : 0;
  const remainingCards = cards.filter((c) => !c.matched).length;

  // 根据卡片数量决定网格列数
  const getGridCols = () => {
    if (totalSets <= 5) return 'grid-cols-3 sm:grid-cols-5';
    if (totalSets <= 8) return 'grid-cols-4 sm:grid-cols-6';
    if (totalSets <= 12) return 'grid-cols-4 sm:grid-cols-6';
    return 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-900 via-pink-900 to-purple-900 flex flex-col p-3 sm:p-4">
      {/* 顶部栏 */}
      <div className="flex justify-between items-center mb-2 sm:mb-3 text-white">
        <button onClick={onExit} className="text-sm opacity-70 hover:opacity-100">
          ← 退出
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-rose-500/50">🎯 配对</span>
          <span className="text-xs sm:text-sm font-medium">HSK {config?.hskLevel}</span>
        </div>
        <div className="flex gap-2 sm:gap-3 text-xs sm:text-sm">
          <span>🔢 {matchedCount}/{totalSets}</span>
          <span>⭐ {score}</span>
          {combo > 1 && (
            <span className="text-yellow-400 animate-pulse">🔥{combo}</span>
          )}
        </div>
      </div>

      {/* 计时器 */}
      <div className="text-center mb-2 sm:mb-3">
        <span className="text-white/70 text-xs sm:text-sm font-mono">⏱ {formatTime(timer)}</span>
      </div>

      {/* 进度条 */}
      <div className="h-1.5 bg-white/20 rounded-full mb-3 sm:mb-5 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-rose-400 to-purple-500"
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* 提示 */}
      <div className="text-center mb-3 sm:mb-4">
        <p className="text-white/60 text-xs sm:text-sm">
          从 {remainingCards} 张卡片中找出同一汉字的拼音、汉字、印尼语
        </p>
      </div>

      {/* 结果提示 */}
      <AnimatePresence>
        {feedback === 'correct' && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center mb-3 sm:mb-4"
          >
            <div className="inline-block bg-green-500 text-white px-4 py-2 rounded-xl font-bold text-sm sm:text-base">
              ✓ 配对正确！+{10 + Math.min(combo, 5) * 2}分
            </div>
          </motion.div>
        )}
        {feedback === 'wrong' && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center mb-3 sm:mb-4"
          >
            <div className="inline-block bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-sm sm:text-base">
              ✗ 配对错误，再试一次
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 卡片网格 - 所有卡片一起显示 */}
      <div className="flex-1 overflow-y-auto">
        <div className={`grid ${getGridCols()} gap-2 sm:gap-3 max-w-4xl mx-auto`}>
          {cards.map((card, idx) => {
            const isSelected = card.selected;
            const canClick = !card.matched;

            return (
              <motion.button
                key={card.id}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{
                  opacity: card.matched ? 0.3 : 1,
                  scale: card.matched ? 0.9 : 1,
                }}
                transition={{ delay: idx * 0.02, duration: 0.3 }}
                whileHover={canClick ? { scale: 1.08 } : {}}
                whileTap={canClick ? { scale: 0.92 } : {}}
                onClick={() => canClick && selectCard(card)}
                disabled={!canClick}
                className={`relative aspect-square rounded-xl sm:rounded-2xl font-bold shadow-lg transition-all duration-300 ${
                  card.matched
                    ? 'bg-green-500/30 text-white/50'
                    : isSelected
                    ? 'bg-rose-400 text-white ring-2 ring-rose-300'
                    : 'bg-white text-gray-800 hover:bg-rose-50 hover:shadow-xl cursor-pointer'
                } ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {/* 卡片内容 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-1 sm:p-2">
                  <span
                    className={`font-bold leading-tight text-center break-words ${
                      card.type === 'hanzi'
                        ? 'text-2xl sm:text-3xl'
                        : card.type === 'pinyin'
                        ? 'text-sm sm:text-base'
                        : 'text-xs sm:text-sm'
                    }`}
                  >
                    {card.value}
                  </span>
                  <span className="text-[9px] sm:text-xs opacity-50 mt-0.5 sm:mt-1">
                    {card.type === 'pinyin'
                      ? '拼音'
                      : card.type === 'hanzi'
                      ? '汉字'
                      : '印尼语'}
                  </span>
                  {card.type === 'hanzi' && !card.matched && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playSound(card.value);
                      }}
                      className="mt-0.5 sm:mt-1 text-[9px] sm:text-xs bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full hover:bg-rose-200"
                    >
                      🔊
                    </button>
                  )}
                </div>

                {/* 已匹配标记 */}
                {card.matched && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl sm:text-4xl opacity-30">✓</span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 已选提示 */}
      {feedback === 'idle' && selectedCards.length > 0 && (
        <div className="text-center mt-2 sm:mt-3">
          <p className="text-white/50 text-xs sm:text-sm">
            已选 {selectedCards.length}/3 张卡片
          </p>
        </div>
      )}

      {/* 底部提示 */}
      <div className="mt-2 sm:mt-4 text-center text-white/30 text-[10px] sm:text-xs">
        点击卡片选择，找出拼音、汉字、印尼语三合一
      </div>
    </div>
  );
}
