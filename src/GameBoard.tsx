import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import hskData from './data/hsk_vocabulary.json';
import chainData from './data/chain_dictionary.json';
import { startSession, logWord, endSession } from './gameAnalytics';

// ==================== 类型 ===================
interface VocabWord {
  word: string;
  pinyin: string;
  indonesian: string;
  components: string[];
  level?: number;
}

interface ChainWord {
  word: string;
  pinyin: string;
  meaning: string;
  hsk?: number;
}

interface GameState {
  level: number;
  words: VocabWord[];
  currentIndex: number;
  score: number;
  correct: number;
  wrong: number;
  selectedRadicals: string[];
  showResult: boolean;
  isCorrect: boolean | null;
  combo: number;
}

type GameMode = 'compose' | 'find' | 'chain';

// ==================== 数据工具 ===================
const getAllWords = (): VocabWord[] => {
  const all: VocabWord[] = [];
  Object.keys(hskData).forEach((k) => {
    const m = k.match(/hsk(\d+)/);
    if (!m) return;
    const lvl = parseInt(m[1]);
    (hskData[k as keyof typeof hskData] as any[]).forEach((w: any) => {
      all.push({ ...w, level: lvl });
    });
  });
  return all;
};

const COMPOSE_BLACKLIST = new Set([
  '需', '象', '卖', '制', '及', '弟',
]);

// 上下结构的字：显示时改为纵向排列
const VERTICAL_LAYOUT_WORDS = new Set([
  // 艹字头
  '花','草','茶','菜','药','苦','芳','芽','苗','英','荷','莲','葱','蒜','蕉','薯','菇','蓝','苏',
  // 宀字头
  '家','字','空','穿','容','实','客','室','宫','害','宽','寄','宿','寂','察','审','宙','宇','宗','宜','富','寒','宣','灾','宝','定','安','完','官',
  // 穴字头
  '窗','突','窄','穷','窝','窃','窥','窑','窟',
  // 竹字头
  '笔','算','等','简','篮','答','第','管','箱','筷','签','篇','策','筑','笑','笛','竿','笋','筒','箭','簿','篱','篷',
  // 雨字头
  '雪','雷','霜','露','雾','霞','震','霖','霍',
  // 日字头
  '早','星','昌','显','景','易','旦','春','普','晴','暑','暗','暴','晓','晶',
  // 田字底/头
  '思','男','累','留','略','界','备','畜','亩',
  // 木在上
  '李','杏','查','柔','某','柴',
  // 人/入字头
  '全','会','合','金','今','命','令','伞','余','企','众','舍','介','仑',
  // 其他常见上下结构
  '务','条','先','光','元','兄','充','党','坐','是','学',
]);

const isValidWord = (w: VocabWord, mode: GameMode = 'compose'): boolean => {
  const c = w.components || [];
  if (c.length < 2) return false;
  if (c.some((x) => x === w.word)) return false;
  if (mode === 'compose' && COMPOSE_BLACKLIST.has(w.word)) return false;
  return true;
};

// ==================== 接龙模式工具 ===================
const getChainOptions = (lastChar: string): string[] => {
  const chains = (chainData as any).chains || {};
  return chains[lastChar] || [];
};

const estimateHSKLevel = (words: ChainWord[]): number => {
  if (words.length === 0) return 1;
  let totalLevel = 0;
  let count = 0;
  for (const w of words) {
    if (w.hsk) {
      totalLevel += w.hsk;
      count++;
    }
  }
  if (count === 0) {
    const all = getAllWords();
    for (const w of words) {
      const found = all.find((aw) => aw.word === w.word);
      if (found && found.level) {
        totalLevel += found.level;
        count++;
      }
    }
  }
  const avg = count > 0 ? totalLevel / count : 1;
  const lenBonus = Math.min(Math.floor(words.length / 5), 2);
  return Math.min(Math.round(avg + lenBonus), 6);
};

// 常见语气词/助词，单独作词尾时通常不构成有效词汇
const INVALID_SUFFIXES = new Set([
  '啦','吗','呢','吧','啊','哦','嗯','哇','呀','哟','哈','哼','唉','哎','喽','嘛','噜','咯','喔','诶',
]);

const isReasonableChineseWord = (word: string): boolean => {
  // 必须2-4个纯汉字
  if (word.length < 2 || word.length > 4) return false;
  if (!/[\u4e00-\u9fa5]{2,4}/.test(word)) return false;
  // 拒绝明显无效：2字词且第二个字是纯语气词
  if (word.length === 2 && INVALID_SUFFIXES.has(word[1])) return false;
  // 拒绝重复字（如"啊啊""哈哈"等，除非在词典里）
  if (word.length === 2 && word[0] === word[1]) return false;
  return true;
};

const getWordInfo = (word: string): { pinyin: string; meaning: string; hsk?: number } => {
  // 1. 优先从接龙词典查找
  const dict = (chainData as any).words || {};
  const entry = dict[word];
  if (entry) {
    return { pinyin: entry.pinyin || '', meaning: entry.meaning || '', hsk: entry.hsk };
  }
  // 2. 回退到 HSK 数据（多字词或单字）
  const all = getAllWords();
  const found = all.find((w) => w.word === word);
  if (found) {
    return { pinyin: found.pinyin, meaning: found.indonesian, hsk: found.level };
  }
  // 3. 智能回退：逐字查找HSK单字，拼接拼音和意思
  const chars = word.split('');
  const charInfos = chars.map((c) => all.find((w) => w.word === c));
  if (charInfos.every((i) => i)) {
    const pinyin = charInfos.map((i) => i!.pinyin).join('');
    const meaning = charInfos.map((i) => i!.indonesian).join(' + ');
    return { pinyin, meaning, hsk: undefined };
  }
  return { pinyin: '', meaning: '', hsk: undefined };
};

const isValidChainWord = (word: string): boolean => {
  const dict = (chainData as any).words || {};
  if (dict[word]) return true;
  // 也允许 HSK 数据里的词
  const all = getAllWords();
  if (all.some((w) => w.word === word)) return true;
  // 算法兜底：允许合理的中文词（自动识别，无需白名单）
  return isReasonableChineseWord(word);
};

const getRandomStarter = (): ChainWord => {
  const starters: string[] = (chainData as any).starters || [];
  if (starters.length === 0) {
    return { word: '音乐', pinyin: 'yīnyuè', meaning: 'musik', hsk: 1 };
  }
  const idx = Math.floor(Math.random() * starters.length);
  const starterChar = starters[idx];
  // 从 chains 中找一个以该字开头的词作为起始词
  const chains = (chainData as any).chains || {};
  const options: string[] = chains[starterChar] || [];
  if (options.length > 0) {
    const word = options[Math.floor(Math.random() * options.length)];
    const info = getWordInfo(word);
    return { word, pinyin: info.pinyin, meaning: info.meaning, hsk: info.hsk };
  }
  // fallback
  return { word: '音乐', pinyin: 'yīnyuè', meaning: 'musik', hsk: 1 };
};

const getMissingComponent = (word: VocabWord, knownComps: string[]): string => {
  const missing = word.components.find((c) => !knownComps.includes(c));
  return missing || word.components[word.components.length - 1] || '?';
};

const getBestKnownComps = (word: VocabWord, pool: VocabWord[]): { known: string[]; missing: string } => {
  const N = word.components.length;
  if (N === 2) {
    let bestKnown = word.components[0];
    let bestMissing = word.components[1];
    let bestCount = 0;
    for (const c of word.components) {
      const cnt = pool.filter((w) => w.word !== word.word && w.components.includes(c)).length;
      if (cnt > bestCount) {
        bestCount = cnt;
        bestKnown = c;
        bestMissing = word.components.find((x) => x !== c) || word.components[1];
      }
    }
    return { known: [bestKnown], missing: bestMissing };
  }
  return { known: word.components.slice(0, N - 1), missing: word.components[N - 1] };
};

const hasEnoughDistractors = (word: VocabWord, pool: VocabWord[], minCount = 3): boolean => {
  const { known } = getBestKnownComps(word, pool);
  const candidates = pool.filter((w) => {
    if (w.word === word.word) return false;
    return w.components.some((c) => known.includes(c));
  });
  const uniqueMissing = new Set(candidates.map((w) => getMissingComponent(w, known)));
  return uniqueMissing.size >= minCount;
};

const generateFindDistractors = (
  target: VocabWord,
  pool: VocabWord[],
  count: number,
  knownComps: string[]
): VocabWord[] => {
  const candidates = pool.filter((w) => {
    if (w.word === target.word) return false;
    return w.components.some((c) => knownComps.includes(c));
  });
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const result: VocabWord[] = [];
  const usedMissing = new Set<string>();
  const targetMissing = getMissingComponent(target, knownComps);
  usedMissing.add(targetMissing);
  for (const w of shuffled) {
    if (result.length >= count) break;
    const missing = getMissingComponent(w, knownComps);
    if (!usedMissing.has(missing)) {
      result.push(w);
      usedMissing.add(missing);
    }
  }
  return result;
};

const getWordsByLevel = (level: number, count = 10): VocabWord[] => {
  const key = `hsk${level}`;
  const words = ((hskData as any)[key] || []) as any[];
  const valid = words
    .map((w: any) => ({ ...w, level }))
    .filter((w: VocabWord) => isValidWord(w, 'compose'));
  if (valid.length === 0) return [];
  return [...valid].sort(() => Math.random() - 0.5).slice(0, Math.min(count, valid.length));
};

const getFindWords = (count = 20): VocabWord[] => {
  const all = getAllWords().filter((w) => isValidWord(w, 'find'));
  const valid = all.filter((w) => hasEnoughDistractors(w, all, 3));
  return [...valid].sort(() => Math.random() - 0.5).slice(0, Math.min(count, valid.length));
};

// ==================== 组件 ===================
export default function GameBoard({ onEnterHeartbeat, onEnterHeartbeatOnline }: { onEnterHeartbeat?: () => void; onEnterHeartbeatOnline?: () => void }) {
  const [gameState, setGameState] = useState<GameState>({
    level: 1,
    words: [],
    currentIndex: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    selectedRadicals: [],
    showResult: false,
    isCorrect: null,
    combo: 0,
  });
  const [gameStarted, setGameStarted] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>('compose');
  const [showHint, setShowHint] = useState(false);
  const [radicalOptions, setRadicalOptions] = useState<string[]>([]);
  const [wordOptions, setWordOptions] = useState<VocabWord[]>([]);
  const [findKnownComps, setFindKnownComps] = useState<string[]>([]);

  // 接龙模式状态
  const [chainTimed, setChainTimed] = useState<boolean>(true);
  const [chainTimeLeft, setChainTimeLeft] = useState<number>(180);
  const [chainWords, setChainWords] = useState<ChainWord[]>([]);
  const [chainInput, setChainInput] = useState<string>('');
  const [chainScore, setChainScore] = useState<number>(0);
  const [chainLevel, setChainLevel] = useState<number>(1);
  const [chainActive, setChainActive] = useState<boolean>(false);
  const [chainFinished, setChainFinished] = useState<boolean>(false);
  const [chainMessage, setChainMessage] = useState<string>('');

  const currentWord = gameState.words[gameState.currentIndex];

  // ========== 拼字模式：生成偏旁选项 ==========
  const generateRadicalOptions = useCallback((components: string[]) => {
    const pool = [
      '亻','氵','扌','讠','忄','王','木','口','土','纟',
      '宀','广','日','阝','雨','子','女','心','火','金',
      '田','钅','足','禾','目','山','衤','虫','文','羊',
      '一','十','大','小','人','力','又','工','寸','夕',
      '巾','乞','亡','凡','勺','刃','干',
    ].filter((r) => !components.includes(r));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const fill = shuffled.slice(0, Math.max(2, 8 - components.length));
    return [...components, ...fill].sort(() => Math.random() - 0.5);
  }, []);

  // ========== 找字模式：生成汉字选项 ==========
  const generateWordOptions = useCallback((target: VocabWord): { options: VocabWord[]; knownComps: string[]; missingComp: string } => {
    const pool = getAllWords().filter((w) => isValidWord(w, 'find'));
    const { known, missing } = getBestKnownComps(target, pool);
    const distractors = generateFindDistractors(target, pool, 3, known);
    return {
      options: [target, ...distractors].sort(() => Math.random() - 0.5),
      knownComps: known,
      missingComp: missing,
    };
  }, []);

  // ========== 开始游戏 ==========
  const startGame = useCallback((level: number) => {
    if (gameMode === 'compose') {
      startSession('compose', { difficulty: level });
      const words = getWordsByLevel(level, 10);
      if (words.length === 0) return;
      setGameState({
        level, words, currentIndex: 0,
        score: 0, correct: 0, wrong: 0,
        selectedRadicals: [], showResult: false, isCorrect: null, combo: 0,
      });
      setGameStarted(true);
      setShowHint(false);
      setRadicalOptions(generateRadicalOptions(words[0].components));
    } else if (gameMode === 'find') {
      startSession('find');
      const words = getFindWords(20);
      if (words.length === 0) return;
      setGameState({
        level: 0, words, currentIndex: 0,
        score: 0, correct: 0, wrong: 0,
        selectedRadicals: [], showResult: false, isCorrect: null, combo: 0,
      });
      setGameStarted(true);
      setShowHint(false);
      const { options, knownComps } = generateWordOptions(words[0]);
      setWordOptions(options);
      setFindKnownComps(knownComps);
    }
  }, [gameMode, generateRadicalOptions, generateWordOptions]);

  // ========== 开始接龙模式 ==========
  const startChainGame = useCallback((timed: boolean) => {
    startSession('chain', { settings: { timed } });
    const starter = getRandomStarter();
    setChainTimed(timed);
    setChainTimeLeft(180);
    setChainWords([starter]);
    setChainInput('');
    setChainScore(0);
    setChainLevel(1);
    setChainActive(true);
    setChainFinished(false);
    setChainMessage('');
    setGameStarted(true);
    setGameMode('chain');
  }, []);

  // ========== 处理接龙输入 ==========
  const submitChainWord = useCallback((inputWord: string) => {
    if (!chainActive || chainFinished) return;
    const trimmed = inputWord.trim();
    if (trimmed.length === 0) return;
    
    const lastWordObj = chainWords[chainWords.length - 1];
    const lastChar = lastWordObj.word[lastWordObj.word.length - 1];
    
    if (trimmed[0] !== lastChar) {
      setChainMessage(`必须以「${lastChar}」开头！`);
      return;
    }
    
    if (chainWords.some((w) => w.word === trimmed)) {
      setChainMessage('这个词已经用过了！');
      setChainInput('');
      return;
    }

    if (!isValidChainWord(trimmed)) {
      setChainMessage(`「${trimmed}」不是有效的中文词汇，请换一词！`);
      return;
    }

    const info = getWordInfo(trimmed);
    const chainWord: ChainWord = {
      word: trimmed,
      pinyin: info.pinyin,
      meaning: info.meaning,
      hsk: info.hsk,
    };
    
    const newWords = [...chainWords, chainWord];
    const newScore = chainScore + 1;
    const newLevel = estimateHSKLevel(newWords);
    
    setChainWords(newWords);
    setChainScore(newScore);
    setChainLevel(newLevel);
    setChainInput('');
    setChainMessage('');
    logWord(trimmed, true, info.pinyin, info.meaning);
  }, [chainActive, chainFinished, chainWords, chainScore]);

  // ========== 结束接龙 ==========
  const finishChain = useCallback(() => {
    endSession({ score: chainScore, correct: chainScore, extra: { chainLength: chainWords.length, timed: chainTimed } });
    setChainFinished(true);
    setChainActive(false);
  }, [chainScore, chainWords.length, chainTimed]);

  // ========== 拼字模式：选择偏旁 ==========
  const selectRadical = useCallback((radical: string) => {
    if (gameState.showResult) return;
    if (gameState.selectedRadicals.includes(radical)) return;
    setGameState((prev) => ({
      ...prev,
      selectedRadicals: [...prev.selectedRadicals, radical],
    }));
  }, [gameState.showResult, gameState.selectedRadicals]);

  const removeRadical = useCallback((index: number) => {
    if (gameState.showResult) return;
    setGameState((prev) => ({
      ...prev,
      selectedRadicals: prev.selectedRadicals.filter((_, i) => i !== index),
    }));
  }, [gameState.showResult]);

  // ========== 拼字模式：确认答案 ==========
  const confirmComposeAnswer = useCallback(() => {
    if (!currentWord || gameState.selectedRadicals.length === 0) return;
    const selected = [...gameState.selectedRadicals].sort().join('');
    const correct = [...currentWord.components].sort().join('');
    const isCorrect = selected === correct;
    const bonus = isCorrect ? Math.min(gameState.combo, 5) * 2 : 0;
    logWord(currentWord.word, isCorrect, currentWord.pinyin, currentWord.indonesian);
    setGameState((prev) => ({
      ...prev,
      showResult: true,
      isCorrect,
      score: isCorrect ? prev.score + 10 + bonus : prev.score,
      correct: isCorrect ? prev.correct + 1 : prev.correct,
      wrong: isCorrect ? prev.wrong : prev.wrong + 1,
      combo: isCorrect ? prev.combo + 1 : 0,
    }));
  }, [currentWord, gameState.selectedRadicals, gameState.combo]);

  // ========== 找字模式：选择汉字答案 ==========
  const selectWordAnswer = useCallback((word: VocabWord) => {
    if (gameState.showResult) return;
    const isCorrect = word.word === currentWord?.word;
    const bonus = isCorrect ? Math.min(gameState.combo, 5) * 2 : 0;
    logWord(word.word, isCorrect, word.pinyin, word.indonesian);
    setGameState((prev) => ({
      ...prev,
      showResult: true,
      isCorrect,
      score: isCorrect ? prev.score + 10 + bonus : prev.score,
      correct: isCorrect ? prev.correct + 1 : prev.correct,
      wrong: isCorrect ? prev.wrong : prev.wrong + 1,
      combo: isCorrect ? prev.combo + 1 : 0,
    }));
  }, [currentWord, gameState.showResult, gameState.combo]);

  // ========== 下一题 ==========
  const nextWord = useCallback(() => {
    if (gameState.currentIndex >= gameState.words.length - 1) {
      endSession({ score: gameState.score, correct: gameState.correct, wrong: gameState.wrong });
      setGameStarted(false);
      return;
    }
    const nextIdx = gameState.currentIndex + 1;
    const next = gameState.words[nextIdx];
    setGameState((prev) => ({
      ...prev,
      currentIndex: nextIdx,
      selectedRadicals: [],
      showResult: false,
      isCorrect: null,
    }));
    setShowHint(false);
    if (gameMode === 'compose') {
      setRadicalOptions(generateRadicalOptions(next.components));
    } else {
      const { options, knownComps } = generateWordOptions(next);
      setWordOptions(options);
      setFindKnownComps(knownComps);
    }
  }, [gameState.currentIndex, gameState.words, gameMode, generateRadicalOptions, generateWordOptions]);

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

  const restartGame = useCallback(() => {
    if (gameMode !== 'chain') {
      startGame(gameState.level);
    } else {
      startChainGame(chainTimed);
    }
  }, [gameState.level, gameMode, startGame, startChainGame, chainTimed]);

  // ========== 接龙模式：计时器 ==========
  useEffect(() => {
    if (!chainActive || !chainTimed || chainFinished) return;
    if (chainTimeLeft <= 0) {
      finishChain();
      return;
    }
    const timer = setInterval(() => {
      setChainTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          finishChain();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [chainActive, chainTimed, chainTimeLeft, chainFinished, finishChain]);

  // ========== 键盘快捷键 ==========
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!gameStarted || gameMode === 'chain') return;
      if (gameMode === 'compose') {
        const n = parseInt(e.key);
        if (n >= 1 && n <= radicalOptions.length) selectRadical(radicalOptions[n - 1]);
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); confirmComposeAnswer(); }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          if (gameState.selectedRadicals.length > 0) removeRadical(gameState.selectedRadicals.length - 1);
        }
      } else {
        const n = parseInt(e.key);
        if (n >= 1 && n <= wordOptions.length) selectWordAnswer(wordOptions[n - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameStarted, gameState.showResult, gameState.selectedRadicals, radicalOptions, wordOptions, gameMode, selectRadical, confirmComposeAnswer, removeRadical, selectWordAnswer]);

  // 接龙模式：输入框回车提交
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!gameStarted || gameMode !== 'chain') return;
      if (e.key === 'Enter' && chainInput.trim()) {
        e.preventDefault();
        submitChainWord(chainInput);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameStarted, gameMode, chainInput, submitChainWord]);

  // ==================== 未开始：首页 ====================
  if (!gameStarted) {
    const hasLevels = [1,2,3,4,5,6,7,8,9,10,11]
      .map((lv) => ({
        level: lv,
        has: ((hskData[`hsk${lv}` as keyof typeof hskData] as any[]) || []).length > 0,
      }))
      .filter((x) => x.has);

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-lg w-full"
        >
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="text-6xl mb-4"
            >🔤</motion.div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
              汉字学习
            </h1>
            <p className="text-gray-500">选择游戏模式开始</p>
          </div>

          {/* 模式切换 */}
          <div className="mb-6">
            <p className="text-center text-sm text-gray-600 mb-3">选择游戏模式</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setGameMode('compose')}
                className={`py-3 px-4 rounded-xl font-bold transition-all shadow-lg ${
                  gameMode === 'compose'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🧩 拼字模式
                <div className="text-xs font-normal mt-1 opacity-80">给汉字，选偏旁</div>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setGameMode('find')}
                className={`py-3 px-4 rounded-xl font-bold transition-all shadow-lg ${
                  gameMode === 'find'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🔍 找字模式
                <div className="text-xs font-normal mt-1 opacity-80">给部首，选汉字</div>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setGameMode('chain')}
                className={`py-3 px-4 rounded-xl font-bold transition-all shadow-lg ${
                  gameMode === 'chain'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🔗 接龙模式
                <div className="text-xs font-normal mt-1 opacity-80">词语接龙挑战</div>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={onEnterHeartbeat}
                className="py-3 px-4 rounded-xl font-bold transition-all shadow-lg bg-gradient-to-r from-red-600 to-pink-600 text-white hover:from-red-700 hover:to-pink-700"
              >
                💓 心跳模式
                <div className="text-xs font-normal mt-1 opacity-90">打字躲避挑战</div>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={onEnterHeartbeatOnline}
                className="py-3 px-4 rounded-xl font-bold transition-all shadow-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700"
              >
                🌐 联机模式
                <div className="text-xs font-normal mt-1 opacity-90">主播+观众同玩</div>
              </motion.button>
            </div>
          </div>

          {/* 拼字模式：选 HSK 级别 */}
          {gameMode === 'compose' ? (
            <>
              <p className="text-center text-sm text-gray-500 mb-3">选择 HSK 级别</p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {hasLevels.map(({ level }) => (
                  <motion.button
                    key={level}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => startGame(level)}
                    className="py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-bold hover:from-blue-600 hover:to-indigo-600 transition-all shadow-lg"
                  >HSK {level}</motion.button>
                ))}
              </div>
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5">
                <h3 className="font-bold text-gray-800 mb-3">📖 拼字规则</h3>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span>上方显示汉字，点击下方偏旁选出它的组成部分</li>
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span>点击汉字可听标准发音</li>
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span>共 10 题，支持键盘快捷键</li>
                </ul>
              </div>
            </>
          ) : gameMode === 'find' ? (
            <>
              <p className="text-center text-sm text-gray-500 mb-3">从全部 HSK 词汇中随机抽取</p>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => startGame(1)}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold text-lg hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg mb-4"
              >🎮 开始挑战</motion.button>
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-5">
                <h3 className="font-bold text-gray-800 mb-3">📖 找字规则</h3>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span>上方显示已知偏旁，根据印尼语意思选出缺失的偏旁</li>
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span>所有选项都共享已知偏旁，需要靠印尼语推断缺失部分</li>
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span>共 20 题，显示 HSK 级别和印尼语意思</li>
                </ul>
              </div>
            </>
          ) : (
            /* 接龙模式 */
            <>
              <p className="text-center text-sm text-gray-500 mb-3">选择接龙模式</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => startChainGame(true)}
                  className="py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-lg hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg"
                >⏱ 限时模式（3分钟）</motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => startChainGame(false)}
                  className="py-4 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl font-bold text-lg hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg"
                >♾ 自由模式（无限制）</motion.button>
              </div>
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5">
                <h3 className="font-bold text-gray-800 mb-3">📖 接龙规则</h3>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span>系统给出第一个词，你需要输入以下一个字开头的词</li>
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span>限时模式：3分钟内接龙，到时间自动结束</li>
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span>自由模式：不限时间，随时可以结束</li>
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span>结束后会根据你的表现估算 HSK 水平</li>
                </ul>
              </div>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // ==================== 接龙模式游戏中 ====================
  if (gameMode === 'chain' && chainActive) {
    const currentWordObj = chainWords[chainWords.length - 1];
    const lastChar = currentWordObj.word[currentWordObj.word.length - 1];
    const options = getChainOptions(lastChar).slice(0, 6);
    
    const formatTime = (seconds: number): string => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-900 via-orange-900 to-yellow-900 flex flex-col p-4 max-w-lg mx-auto">
        {/* 顶部栏 */}
        <div className="flex justify-between items-center mb-3 text-white">
          <button onClick={finishChain} className="text-sm opacity-70 hover:opacity-100">← 结束接龙</button>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-amber-500/50">
              接龙模式
            </span>
            {chainTimed && (
              <span className={`text-sm font-mono ${chainTimeLeft <= 30 ? 'text-red-400 animate-pulse' : 'text-amber-200'}`}>
                ⏱ {formatTime(chainTimeLeft)}
              </span>
            )}
          </div>
          <div className="flex gap-3 text-sm">
            <span>📊 {chainScore}</span>
            <span>🎓 HSK {chainLevel}</span>
          </div>
        </div>

        {/* 当前词展示 */}
        <motion.div
          key={currentWordObj.word}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 mb-4 text-center"
        >
          <div 
            className="text-5xl font-bold text-gray-800 hover:text-blue-600 transition-colors cursor-pointer select-none mb-2"
            onClick={() => playSound(currentWordObj.word)}
          >{currentWordObj.word}</div>
          <div className="text-gray-400 text-sm">点击播放发音</div>
          {currentWordObj.pinyin && (
            <div className="text-gray-500 text-sm mt-1">{currentWordObj.pinyin}</div>
          )}
          {currentWordObj.meaning && (
            <div className="text-green-700 font-medium text-sm mt-1">🇮🇩 {currentWordObj.meaning}</div>
          )}
          <div className="text-gray-400 text-sm mt-3">下一个词必须以「<span className="text-amber-600 font-bold">{lastChar}</span>」开头</div>
        </motion.div>

        {/* 输入区域 */}
        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={chainInput}
              onChange={(e) => setChainInput(e.target.value)}
              placeholder={`请输入以"${lastChar}"开头的词语...`}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-amber-300 focus:border-amber-500 focus:outline-none bg-white/90 text-gray-800 text-lg"
              autoFocus
            />
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => submitChainWord(chainInput)}
              disabled={chainInput.trim().length === 0}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >提交</motion.button>
          </div>
          {chainMessage && (
            <div className="mt-2 text-red-300 text-sm text-center">{chainMessage}</div>
          )}
        </div>

        {/* 提示词汇 */}
        {options.length > 0 && (
          <div className="mb-4">
            <p className="text-white/70 text-sm mb-2">💡 提示：你可以尝试这些词</p>
            <div className="flex flex-wrap gap-2">
              {options.map((opt, idx) => (
                <motion.button
                  key={`${opt}-${idx}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => submitChainWord(opt)}
                  className="px-3 py-2 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-all"
                >{opt}</motion.button>
              ))}
            </div>
          </div>
        )}

        {/* 接龙历史 - 楼梯动画 */}
        <div className="flex-1 overflow-y-auto">
          <p className="text-white/70 text-sm mb-2">📚 接龙记录（共 {chainWords.length} 个词）</p>
          <div className="space-y-2">
            <AnimatePresence>
              {chainWords.map((w, idx) => (
                <motion.div
                  key={`${w.word}-${idx}`}
                  initial={{ opacity: 0, x: -50, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={`flex items-center gap-3 p-3 bg-white/10 backdrop-blur-sm rounded-xl ${
                    idx % 2 === 0 ? 'ml-0' : 'ml-8'
                  }`}
                >
                  <div className="w-8 h-8 bg-gradient-to-r from-amber-400 to-orange-400 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {idx + 1}
                  </div>
                  <div className="text-white">
                    <span className="text-lg font-bold">{w.word}</span>
                    {w.pinyin && <span className="text-sm ml-2 opacity-70">{w.pinyin}</span>}
                  </div>
                  {w.hsk && (
                    <div className="ml-auto text-xs bg-white/20 text-white px-2 py-1 rounded-full">
                      HSK {w.hsk}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* 结束按钮 */}
        {!chainTimed && (
          <motion.button
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            onClick={finishChain}
            className="w-full py-4 mt-4 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl font-bold text-lg shadow-lg"
          >结束接龙，查看结果 →</motion.button>
        )}
      </div>
    );
  }

  // ==================== 接龙模式结束 ====================
  if (gameMode === 'chain' && chainFinished) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-900 via-orange-900 to-yellow-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-md w-full text-center"
        >
          <motion.div 
            initial={{ scale: 0 }} 
            animate={{ scale: 1 }} 
            transition={{ delay: 0.2, type: 'spring' }} 
            className="text-7xl mb-4"
          >🏆</motion.div>
          <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">接龙结束！</h2>
          
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4">
              <div className="text-3xl font-bold text-blue-600">{chainWords.length}</div>
              <div className="text-xs text-gray-500">接龙长度</div>
            </div>
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4">
              <div className="text-3xl font-bold text-amber-600">HSK {chainLevel}</div>
              <div className="text-xs text-gray-500">估算水平</div>
            </div>
          </div>

          {/* 接龙词列表 */}
          <div className="mb-6 text-left">
            <h3 className="font-bold text-gray-800 mb-3">📚 你的接龙词</h3>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {chainWords.map((w, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </div>
                  <span className="font-medium text-gray-800">{w.word}</span>
                  {w.pinyin && <span className="text-xs text-gray-500">{w.pinyin}</span>}
                  {w.hsk && <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded">HSK {w.hsk}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* HSK 水平说明 */}
          <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-xl p-4 mb-6 text-left">
            <h3 className="font-bold text-gray-800 mb-2">📊 你的 HSK 水平估算</h3>
            <div className="text-2xl font-bold text-green-600 mb-1">
              HSK {chainLevel} {chainLevel <= 2 ? '👶' : chainLevel <= 4 ? '👍' : '🌟'}
            </div>
            <p className="text-sm text-gray-600">
              {chainLevel <= 1 ? '初学者：掌握基础词汇' :
               chainLevel <= 2 ? '初级：能进行简单交流' :
               chainLevel <= 3 ? '中级：能应对日常场景' :
               chainLevel <= 4 ? '中高级：能理解复杂文本' :
               chainLevel <= 5 ? '高级：能流利表达观点' :
               '精通级：接近母语水平'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              接了 {chainWords.length} 个词，平均 HSK 水平 {chainLevel}
            </p>
          </div>

          <div className="space-y-3">
            <button 
              onClick={() => startChainGame(chainTimed)}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg"
            >再来一局</button>
            <button 
              onClick={() => { setGameStarted(false); setGameMode('compose'); }}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all"
            >返回首页</button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ==================== 游戏结束 ====================
  if (gameMode !== 'chain' && gameState.currentIndex >= gameState.words.length) {
    const total = gameState.correct + gameState.wrong;
    const accuracy = total > 0 ? Math.round((gameState.correct / total) * 100) : 0;
    const rating = accuracy >= 90 ? '🌟' : accuracy >= 70 ? '👍' : accuracy >= 50 ? '💪' : '📚';
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-900 to-cyan-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-md w-full text-center"
        >
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }} className="text-7xl mb-4">{rating}</motion.div>
          <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">游戏完成！</h2>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-blue-50 rounded-xl p-4"><div className="text-3xl font-bold text-blue-600">{gameState.score}</div><div className="text-xs text-gray-500">得分</div></div>
            <div className="bg-green-50 rounded-xl p-4"><div className="text-3xl font-bold text-green-600">{gameState.correct}</div><div className="text-xs text-gray-500">正确</div></div>
            <div className="bg-red-50 rounded-xl p-4"><div className="text-3xl font-bold text-red-600">{gameState.wrong}</div><div className="text-xs text-gray-500">错误</div></div>
          </div>
          <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl">
            <div className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{accuracy}%</div>
            <div className="text-gray-500 text-sm">正确率</div>
          </div>
          <div className="space-y-3">
            <button onClick={restartGame} className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg">再玩一次</button>
            <button onClick={() => setGameStarted(false)} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all">返回首页</button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ==================== 游戏中 ===================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 flex flex-col p-4 max-w-lg mx-auto">
      {/* 顶部栏 */}
      <div className="flex justify-between items-center mb-3 text-white">
        <button onClick={() => setGameStarted(false)} className="text-sm opacity-70 hover:opacity-100">← 退出</button>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full ${
            gameMode === 'compose' ? 'bg-purple-500/50' : 'bg-emerald-500/50'
          }`}>
            {gameMode === 'compose' ? '🧩 拼字' : '🔍 找字'}
          </span>
          {gameMode === 'compose' && <span className="text-sm font-medium">HSK {gameState.level}</span>}
          {gameMode === 'find' && <span className="text-sm font-medium text-emerald-300">全部词汇</span>}
        </div>
        <div className="flex gap-3 text-sm">
          <span>🔢 {gameState.currentIndex + 1}/{gameState.words.length}</span>
          <span>⭐ {gameState.score}</span>
          {gameState.combo > 1 && <span className="text-yellow-400 animate-pulse">🔥{gameState.combo}</span>}
        </div>
      </div>

      {/* 进度条 */}
      <div className="h-1.5 bg-white/20 rounded-full mb-5 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-yellow-400 to-orange-500"
          initial={{ width: '0%' }}
          animate={{ width: `${((gameState.currentIndex) / gameState.words.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* ========== 拼字模式 ========== */}
      {gameMode === 'compose' && currentWord && (
        <>
          {/* 目标汉字 */}
          <motion.div
            key={currentWord.word}
            initial={{ opacity: 0, x: 50, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 mb-5 text-center"
          >
            <button
              onClick={() => playSound(currentWord.word)}
              className="text-7xl font-bold text-gray-800 hover:text-blue-600 transition-colors cursor-pointer select-none"
            >{currentWord.word}</button>
            <div className="text-gray-400 text-sm mt-2">点击播放发音</div>

            <AnimatePresence>
              {gameState.showResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`mt-4 p-4 rounded-xl ${gameState.isCorrect ? 'bg-green-100' : 'bg-red-100'}`}
                >
                  <div className={`text-lg font-medium ${gameState.isCorrect ? 'text-green-600' : 'text-red-600'} mb-1`}>
                    {gameState.isCorrect ? '✓  正确！' : '✗  错误'}
                  </div>
                  <div className="text-green-700 font-medium mb-1">🇮🇩 {currentWord.indonesian}</div>
                  <div className="text-gray-600 text-sm">{currentWord.pinyin}</div>
                  {currentWord.components && (
                    <div className="text-xs text-gray-400 mt-2">偏旁：{currentWord.components.join(' + ')}</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* 已选偏旁 */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-5 min-h-[72px] flex items-center justify-center">
            <div className="flex flex-wrap gap-2 justify-center">
              <AnimatePresence mode="popLayout">
                {gameState.selectedRadicals.map((rad, idx) => (
                  <motion.button
                    key={`${rad}-${idx}`}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 180 }}
                    whileHover={{ scale: 1.1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    onClick={() => removeRadical(idx)}
                    className="w-14 h-14 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center text-2xl font-bold text-white shadow-lg cursor-pointer"
                  >{rad}</motion.button>
                ))}
              </AnimatePresence>
              {gameState.selectedRadicals.length === 0 && (
                <div className="text-white/50 text-sm py-2">点击下方偏旁进行选择</div>
              )}
            </div>
          </div>

          {/* 偏旁选项 */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            {radicalOptions.map((rad, idx) => {
              const sel = gameState.selectedRadicals.includes(rad);
              return (
                <motion.button
                  key={`opt-${rad}-${idx}`}
                  initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  whileHover={!sel && !gameState.showResult ? { scale: 1.1 } : {}}
                  whileTap={!sel && !gameState.showResult ? { scale: 0.9 } : {}}
                  onClick={() => !sel && !gameState.showResult && selectRadical(rad)}
                  disabled={sel || gameState.showResult}
                  className={`h-14 rounded-xl text-xl font-bold shadow-lg transition-all ${
                    sel ? 'bg-gray-300 text-gray-400 cursor-not-allowed' : 'bg-white/90 text-gray-800 hover:bg-white cursor-pointer'
                  }`}
                >{rad}</motion.button>
              );
            })}
          </div>

          {/* 提示 & 按钮 */}
          {!gameState.showResult && (
            <>
              {!showHint ? (
                <button onClick={() => setShowHint(true)} className="w-full py-2 mb-4 bg-yellow-500/20 text-yellow-300 rounded-xl text-sm">💡 显示提示</button>
              ) : (
                <div className="bg-yellow-500/20 text-yellow-300 p-3 rounded-xl text-sm mb-4 text-center">
                  💡 这个字由 <strong>{currentWord.components.length}</strong> 个偏旁组成
                </div>
              )}
              <div className="space-y-3">
                <button
                  onClick={confirmComposeAnswer}
                  disabled={gameState.selectedRadicals.length === 0}
                  className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${
                    gameState.selectedRadicals.length === 0
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600'
                  }`}
                >确认答案</button>
                <button onClick={() => setGameState((p) => ({ ...p, selectedRadicals: [] }))} className="w-full py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all">清空选择</button>
              </div>
            </>
          )}
          {gameState.showResult && (
            <motion.button
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              onClick={nextWord}
              className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-bold text-lg shadow-lg"
            >{gameState.currentIndex >= gameState.words.length - 1 ? '🎉  查看结果' : '下一题 →'}</motion.button>
          )}
        </>
      )}

      {/* ========== 找字模式 ========== */}
      {gameMode === 'find' && currentWord && (() => {
        const knownComps = findKnownComps.length > 0 ? findKnownComps : [currentWord.components[0] || ''];
        const isMulti = knownComps.length > 1;

        return (
          <>
            <motion.div
              key={'find-' + currentWord.word + '-' + gameState.currentIndex}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 mb-5 text-center"
            >
              {/* 布局类型标签 */}
              <div className="text-xs text-gray-400 mb-3 tracking-wide">
                {isMulti ? '部首组合 · 补全缺失部分' : '偏旁格式 · 补全缺失部分'}
              </div>

              {/* 偏旁/部首显示区：按字的真实部件顺序显示 */}
              <div className={`flex justify-center items-center gap-2 mb-4 flex-wrap ${VERTICAL_LAYOUT_WORDS.has(currentWord.word) ? 'flex-col' : 'flex-row'}`}>
                {currentWord.components.map((comp, i) => {
                  const isKnown = knownComps.includes(comp);
                  return (
                    <div key={`comp-${i}`} className="flex items-center gap-2">
                      {isKnown ? (
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 border-2 border-blue-300 rounded-xl flex items-center justify-center font-bold text-gray-800 text-3xl">
                          {comp}
                        </div>
                      ) : (
                        <div className="w-16 h-16 border-3 border-dashed border-gray-300 rounded-xl bg-gray-50 flex items-center justify-center text-gray-300 text-3xl">?</div>
                      )}
                      {i < currentWord.components.length - 1 && (
                        <span className="text-gray-400 text-xl font-bold">+</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 印尼语提示（可展开） */}
              {!gameState.showResult && (
                <div className="mb-2">
                  {!showHint ? (
                    <button
                      onClick={() => setShowHint(true)}
                      className="text-sm text-blue-500 underline underline-offset-2 hover:text-blue-700"
                    >显示提示（印尼语意思）</button>
                  ) : (
                    <div className="text-lg text-green-700 font-medium">🇮🇩 {currentWord.indonesian}</div>
                  )}
                </div>
              )}

              {/* 结果区 */}
              <AnimatePresence>
                {gameState.showResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`mt-4 p-5 rounded-2xl border ${
                      gameState.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className={`text-lg font-bold mb-2 ${
                      gameState.isCorrect ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {gameState.isCorrect ? '✓  正确！' : '✗  错误'}
                    </div>
                    <div className="text-6xl font-bold text-gray-800 mb-2">{currentWord.word}</div>
                    <div className="text-green-700 font-medium mb-1">🇮🇩 {currentWord.indonesian}</div>
                    <div className="text-gray-500 text-sm mb-2">{currentWord.pinyin}</div>
                    {currentWord.level && (
                      <div className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">HSK {currentWord.level}</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* 汉字选项 2×2 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {wordOptions.map((w, idx) => {
                const correct = w.word === currentWord.word;
                return (
                  <motion.button
                    key={`w-${w.word}-${idx}`}
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    whileHover={!gameState.showResult ? { scale: 1.04 } : {}}
                    whileTap={!gameState.showResult ? { scale: 0.96 } : {}}
                    onClick={() => !gameState.showResult && selectWordAnswer(w)}
                    disabled={gameState.showResult}
                    className={`py-5 rounded-2xl font-bold text-4xl shadow-lg transition-all duration-200 ${
                      gameState.showResult && correct
                        ? 'bg-green-500 text-white scale-105 ring-4 ring-green-300'
                        : gameState.showResult && !correct
                          ? 'bg-gray-100 text-gray-300'
                          : 'bg-white text-gray-800 hover:bg-blue-50 hover:shadow-xl cursor-pointer active:scale-95'
                    }`}
                  >{getMissingComponent(w, findKnownComps)}</motion.button>
                );
              })}
            </div>

            {/* 下一题 */}
            {gameState.showResult && (
              <motion.button
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                onClick={nextWord}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-bold text-lg shadow-lg hover:from-emerald-600 hover:to-teal-600 transition-all"
              >{gameState.currentIndex >= gameState.words.length - 1 ? '🎉  查看结果' : '下一题 →'}</motion.button>
            )}
          </>
        );
      })()}

      {/* 键盘提示 */}
      <div className="mt-4 text-center text-white/40 text-xs">
        {gameMode === 'compose'
          ? '键盘: 1-9 选偏旁 | 空格确认 | 退格删除'
          : '键盘: 1-4 选汉字'
        }
      </div>
    </div>
  );
}
