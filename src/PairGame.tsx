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
  flipped: boolean;
}

interface PairSet {
  word: VocabWord;
  cards: CardItem[];
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
  const [sets, setSets] = useState<PairSet[]>([]);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [selectedCards, setSelectedCards] = useState<CardItem[]>([]);
  const [setResult, setSetResult] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [score, setScore] = useState(0);
  const [correctSets, setCorrectSets] = useState(0);
  const [wrongSets, setWrongSets] = useState(0);
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [combo, setCombo] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 可用的 HSK 级别
  const availableLevels = [1, 2, 3, 4, 5, 6].filter(
    (lv) => ((hskData[`hsk${lv}` as keyof typeof hskData] as any[]) || []).length > 0
  );

  // ========== 开始游戏 ==========
  const startGame = useCallback((hskLevel: number, setCount: number) => {
    startSession('pair', { difficulty: hskLevel, settings: { setCount } });
    const words = getWordsByLevel(hskLevel, setCount);
    if (words.length === 0) return;

    const gameSets: PairSet[] = words.map((word, idx) => {
      const cards: CardItem[] = [
        { id: `p-${idx}`, type: 'pinyin', value: word.pinyin, word: word.word, matched: false, flipped: false },
        { id: `h-${idx}`, type: 'hanzi', value: word.word, word: word.word, matched: false, flipped: false },
        { id: `i-${idx}`, type: 'indonesian', value: word.indonesian, word: word.word, matched: false, flipped: false },
      ];
      return { word, cards };
    });

    setSets(gameSets);
    setCurrentSetIndex(0);
    setCards([...gameSets[0].cards].sort(() => Math.random() - 0.5));
    setSelectedCards([]);
    setSetResult('idle');
    setScore(0);
    setCorrectSets(0);
    setWrongSets(0);
    setTimer(0);
    setTimerRunning(true);
    setGameFinished(false);
    setCombo(0);
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
    if (setResult !== 'idle') return;
    if (card.matched) return;
    if (selectedCards.some((c) => c.id === card.id)) return;
    if (selectedCards.length >= 3) return;

    const newSelected = [...selectedCards, card];
    setSelectedCards(newSelected);

    // 翻转动画
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, flipped: true } : c))
    );

    // 选满3张时检查
    if (newSelected.length === 3) {
      const allSameWord = newSelected.every((c) => c.word === newSelected[0].word);
      const allDifferentTypes = new Set(newSelected.map((c) => c.type)).size === 3;
      const isCorrect = allSameWord && allDifferentTypes;

      setTimeout(() => {
        if (isCorrect) {
          // 正确：标记为已匹配
          setCards((prev) =>
            prev.map((c) =>
              newSelected.some((s) => s.id === c.id) ? { ...c, matched: true } : c
            )
          );
          const bonus = Math.min(combo, 5) * 2;
          setScore((prev) => prev + 10 + bonus);
          setCorrectSets((prev) => prev + 1);
          setCombo((prev) => prev + 1);
          setSetResult('correct');
          logWord(newSelected[0].word, true, newSelected[0].value, newSelected[2].value);
        } else {
          // 错误：翻回去
          setCards((prev) =>
            prev.map((c) =>
              newSelected.some((s) => s.id === c.id) ? { ...c, flipped: false } : c
            )
          );
          setWrongSets((prev) => prev + 1);
          setCombo(0);
          setSetResult('wrong');
          logWord(newSelected[0].word, false);
        }
      }, 600);
    }
  }, [selectedCards, setResult, combo]);

  // ========== 下一套 ==========
  const nextSet = useCallback(() => {
    const nextIndex = currentSetIndex + 1;
    if (nextIndex >= sets.length) {
      // 游戏结束
      setTimerRunning(false);
      endSession({
        score,
        correct: correctSets + (setResult === 'correct' ? 1 : 0),
        wrong: wrongSets + (setResult === 'wrong' ? 1 : 0),
        extra: { totalSets: sets.length, timeSeconds: timer },
      });
      setGameFinished(true);
      return;
    }

    setCurrentSetIndex(nextIndex);
    setCards([...sets[nextIndex].cards].sort(() => Math.random() - 0.5));
    setSelectedCards([]);
    setSetResult('idle');
  }, [currentSetIndex, sets, score, correctSets, wrongSets, setResult, timer]);

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
            <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-3">
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
                每套包含 3 张卡片：拼音、汉字、印尼语
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                点击翻开卡片，找出属于同一汉字的 3 张
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                3 张全部配对正确才能进入下一套
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                配对错误会翻回，连续正确有连击加分
              </li>
            </ul>
          </div>
        </motion.div>
      </div>
    );
  }

  // ==================== 游戏结束 ====================
  if (gameFinished) {
    const total = correctSets + wrongSets;
    const accuracy = total > 0 ? Math.round((correctSets / total) * 100) : 0;
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
              <div className="text-2xl sm:text-3xl font-bold text-green-600">{correctSets}</div>
              <div className="text-xs text-gray-500">配对成功</div>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <div className="text-2xl sm:text-3xl font-bold text-red-600">{wrongSets}</div>
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
  const progress = sets.length > 0 ? ((currentSetIndex) / sets.length) * 100 : 0;

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
          <span>
            🔢 {currentSetIndex + 1}/{sets.length}
          </span>
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

      {/* 当前套提示 */}
      <div className="text-center mb-3 sm:mb-4">
        <p className="text-white/60 text-xs sm:text-sm">
          找出属于同一个汉字的 3 张卡片
        </p>
      </div>

      {/* 结果提示 */}
      <AnimatePresence>
        {setResult === 'correct' && (
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
        {setResult === 'wrong' && (
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

      {/* 卡片网格 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-sm sm:max-w-md w-full">
          {cards.map((card, idx) => {
            const isSelected = selectedCards.some((c) => c.id === card.id);
            const canClick = setResult === 'idle' && !card.matched && !isSelected;

            return (
              <motion.button
                key={card.id}
                initial={{ opacity: 0, rotateY: 180, scale: 0.8 }}
                animate={{
                  opacity: 1,
                  rotateY: card.flipped || card.matched ? 0 : 180,
                  scale: card.matched ? 0.95 : 1,
                }}
                transition={{ delay: idx * 0.1, duration: 0.4 }}
                whileHover={canClick ? { scale: 1.05 } : {}}
                whileTap={canClick ? { scale: 0.95 } : {}}
                onClick={() => canClick && selectCard(card)}
                disabled={!canClick}
                className={`relative aspect-square rounded-xl sm:rounded-2xl font-bold shadow-lg transition-all duration-300 ${
                  card.matched
                    ? 'bg-green-500 text-white ring-2 ring-green-300'
                    : isSelected
                    ? 'bg-rose-400 text-white'
                    : card.flipped
                    ? 'bg-white text-gray-800'
                    : 'bg-gradient-to-br from-rose-400 to-purple-500 text-white hover:from-rose-500 hover:to-purple-600'
                } ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
                style={{ perspective: '1000px' }}
              >
                {/* 卡片正面内容 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-1 sm:p-2">
                  {card.flipped || card.matched ? (
                    <>
                      <span
                        className={`font-bold leading-tight ${
                          card.type === 'hanzi'
                            ? 'text-2xl sm:text-4xl'
                            : 'text-xs sm:text-sm'
                        }`}
                      >
                        {card.value}
                      </span>
                      <span className="text-[10px] sm:text-xs opacity-60 mt-1">
                        {card.type === 'pinyin'
                          ? '拼音'
                          : card.type === 'hanzi'
                          ? '汉字'
                          : '印尼语'}
                      </span>
                      {card.type === 'hanzi' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playSound(card.value);
                          }}
                          className="mt-1 text-[10px] sm:text-xs bg-white/20 px-1.5 py-0.5 rounded-full hover:bg-white/30"
                        >
                          🔊
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-lg sm:text-2xl">?</span>
                      <span className="text-[10px] sm:text-xs opacity-80 mt-1">点击翻开</span>
                    </>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 下一套按钮 */}
      {setResult === 'correct' && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={nextSet}
          className="w-full py-3 sm:py-4 mt-3 sm:mt-4 bg-gradient-to-r from-rose-500 to-purple-500 text-white rounded-xl font-bold text-base sm:text-lg shadow-lg hover:from-rose-600 hover:to-purple-600 transition-all"
        >
          {currentSetIndex >= sets.length - 1 ? '🎉 查看结果' : '下一套 →'}
        </motion.button>
      )}

      {/* 已选提示 */}
      {setResult === 'idle' && selectedCards.length > 0 && (
        <div className="text-center mt-2 sm:mt-3">
          <p className="text-white/50 text-xs sm:text-sm">
            已选 {selectedCards.length}/3 张卡片
          </p>
        </div>
      )}

      {/* 底部提示 */}
      <div className="mt-2 sm:mt-4 text-center text-white/30 text-[10px] sm:text-xs">
        点击卡片翻开，找出拼音、汉字、印尼语三合一
      </div>
    </div>
  );
}
