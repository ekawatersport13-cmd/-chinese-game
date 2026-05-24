import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ref, set, onValue, onDisconnect, remove, update, get, serverTimestamp } from 'firebase/database';
import { db } from './firebase';
import { getDeviceId } from './deviceId';
import basicData from './data/guess_who_basic.json';
import advancedData from './data/guess_who_advanced.json';

// ==================== 类型 ====================
interface BasicCard {
  id: string;
  type: 'char' | 'word';
  word: string;
  pinyin: string;
  indonesian: string;
  hsk: number;
  components: string[];
  componentCount: number;
  firstChar: string;
  lastChar: string;
  charCount: number;
  tones: string[];
  firstTone: string;
}

interface AvatarParams {
  skinColor: string;
  hairColor: string;
  hairStyle: string;
  hasGlasses: boolean;
  hasHat: boolean;
  clothesColor: string;
  expression: string;
  gender: string;
}

interface AdvancedCard {
  id: string;
  scene: string;
  name: string;
  description: string;
  descriptionPinyin: string;
  attributes: Record<string, any>;
  avatarParams: AvatarParams;
}

interface BoardCard {
  card: BasicCard | AdvancedCard;
  flipped: boolean; // flipped = 排除掉了
}

type GameLevel = 'basic' | 'advanced';
type GameOnlineMode = 'solo' | 'online';
type OnlineRole = 'host' | 'guest';
type GamePhase = 'menu' | 'level_select' | 'scene_select' | 'playing' | 'gameover' | 'waiting_room' | 'answering';

// 颜色名映射
const COLOR_MAP: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
  white: '#f3f4f6', black: '#1f2937', purple: '#a855f7', orange: '#f97316',
};

// ==================== SVG 头像生成 ====================
function AvatarSVG({ params, size = 80 }: { params: AvatarParams; size?: number }) {
  const { skinColor, hairColor, hairStyle, hasGlasses, hasHat, clothesColor, expression, gender } = params;
  const bodyColor = COLOR_MAP[clothesColor] || '#6b7280';
  const s = size;
  const cx = s / 2;
  const isFemale = gender === '女';

  // 表情
  let mouth = null;
  if (expression === 'happy') {
    mouth = <path d={`M ${cx - 8} ${s * 0.58} Q ${cx} ${s * 0.66} ${cx + 8} ${s * 0.58}`} fill="none" stroke="#c0392b" strokeWidth="1.5" strokeLinecap="round" />;
  } else if (expression === 'sad') {
    mouth = <path d={`M ${cx - 8} ${s * 0.64} Q ${cx} ${s * 0.58} ${cx + 8} ${s * 0.64}`} fill="none" stroke="#c0392b" strokeWidth="1.5" strokeLinecap="round" />;
  } else if (expression === 'angry') {
    mouth = <line x1={cx - 7} y1={s * 0.63} x2={cx + 7} y2={s * 0.63} stroke="#c0392b" strokeWidth="2" strokeLinecap="round" />;
  } else if (expression === 'surprised') {
    mouth = <ellipse cx={cx} cy={s * 0.62} rx="5" ry="7" fill="#c0392b" />;
  } else {
    mouth = <line x1={cx - 7} y1={s * 0.61} x2={cx + 7} y2={s * 0.61} stroke="#c0392b" strokeWidth="1.5" strokeLinecap="round" />;
  }

  // 发型
  let hair = null;
  if (hairStyle === 'short') {
    if (isFemale) {
      // 女性短发：更圆润，带刘海
      hair = <>
        <ellipse cx={cx} cy={s * 0.26} rx={s * 0.24} ry={s * 0.16} fill={hairColor} />
        <rect x={cx - s * 0.18} y={s * 0.32} width={s * 0.36} height={s * 0.04} rx="2" fill={hairColor} />
      </>;
    } else {
      // 男性短发：方正
      hair = <ellipse cx={cx} cy={s * 0.26} rx={s * 0.22} ry={s * 0.14} fill={hairColor} />;
    }
  } else if (hairStyle === 'long') {
    // 长发 - 明显女性特征
    hair = <>
      <ellipse cx={cx} cy={s * 0.26} rx={s * 0.24} ry={s * 0.16} fill={hairColor} />
      <rect x={cx - s * 0.22} y={s * 0.34} width={s * 0.1} height={s * 0.28} rx="4" fill={hairColor} />
      <rect x={cx + s * 0.12} y={s * 0.34} width={s * 0.1} height={s * 0.28} rx="4" fill={hairColor} />
    </>;
  } else if (hairStyle === 'bun') {
    // 丸子头 - 明显女性特征
    hair = <>
      <ellipse cx={cx} cy={s * 0.26} rx={s * 0.24} ry={s * 0.16} fill={hairColor} />
      <circle cx={cx} cy={s * 0.14} r={s * 0.08} fill={hairColor} />
    </>;
  } else if (hairStyle === 'curly') {
    hair = <>
      <ellipse cx={cx} cy={s * 0.26} rx={s * 0.22} ry={s * 0.14} fill={hairColor} />
      <circle cx={cx - s * 0.18} cy={s * 0.28} r={s * 0.06} fill={hairColor} />
      <circle cx={cx + s * 0.18} cy={s * 0.28} r={s * 0.06} fill={hairColor} />
    </>;
  }
  // bald: hair = null

  // 男性眉毛（粗） / 女性睫毛
  const facialFeatures = isFemale ? (
    <>
      {/* 女性睫毛 */}
      <line x1={cx - s * 0.11} y1={s * 0.39} x2={cx - s * 0.13} y2={s * 0.37} stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />
      <line x1={cx + s * 0.05} y1={s * 0.39} x2={cx + s * 0.07} y2={s * 0.37} stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />
      <line x1={cx - s * 0.09} y1={s * 0.39} x2={cx - s * 0.10} y2={s * 0.37} stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />
      <line x1={cx + s * 0.11} y1={s * 0.39} x2={cx + s * 0.12} y2={s * 0.37} stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />
    </>
  ) : (
    <>
      {/* 男性粗眉毛 */}
      <line x1={cx - s * 0.12} y1={s * 0.37} x2={cx - s * 0.04} y2={s * 0.385} stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
      <line x1={cx + s * 0.04} y1={s * 0.385} x2={cx + s * 0.12} y2={s * 0.37} stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
    </>
  );

  // 身体：男性更宽厚（梯形），女性更窄（A字裙）
  const bodyW = isFemale ? s * 0.24 : s * 0.3;
  const bodyH = isFemale ? s * 0.2 : s * 0.22;
  const bodyY = isFemale ? s * 0.84 : s * 0.85;

  const body = isFemale ? (
    // A字裙形状
    <path d={`M ${cx - s * 0.12} ${s * 0.72} L ${cx - bodyW} ${bodyY + bodyH} Q ${cx - bodyW} ${bodyY + bodyH + s * 0.04} ${cx - bodyW + s * 0.04} ${bodyY + bodyH + s * 0.04} L ${cx + bodyW - s * 0.04} ${bodyY + bodyH + s * 0.04} Q ${cx + bodyW} ${bodyY + bodyH + s * 0.04} ${cx + bodyW} ${bodyY + bodyH} L ${cx + s * 0.12} ${s * 0.72} Z`} fill={bodyColor} />
  ) : (
    // 矩形身体（男性宽肩）
    <rect x={cx - bodyW} y={s * 0.72} width={bodyW * 2} height={bodyH} rx="4" fill={bodyColor} />
  );

  // 脖子：女性更细
  const neckW = isFemale ? s * 0.04 : s * 0.06;

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} xmlns="http://www.w3.org/2000/svg">
      {/* 身体 */}
      {body}
      {/* 脖子 */}
      <rect x={cx - neckW} y={s * 0.63} width={neckW * 2} height={s * 0.1} fill={skinColor} />
      {/* 头部 */}
      <ellipse cx={cx} cy={s * 0.42} rx={s * 0.22} ry={s * 0.24} fill={skinColor} />
      {/* 头发 */}
      {hair}
      {/* 眼睛 */}
      <circle cx={cx - s * 0.08} cy={s * 0.42} r={s * 0.03} fill="#1a1a1a" />
      <circle cx={cx + s * 0.08} cy={s * 0.42} r={s * 0.03} fill="#1a1a1a" />
      {/* 面部特征（眉毛/睫毛） */}
      {facialFeatures}
      {/* 眼镜 */}
      {hasGlasses && (
        <g stroke="#4b5563" strokeWidth="1.2" fill="none">
          <rect x={cx - s * 0.14} y={s * 0.38} width={s * 0.11} height={s * 0.09} rx="2" />
          <rect x={cx + s * 0.03} y={s * 0.38} width={s * 0.11} height={s * 0.09} rx="2" />
          <line x1={cx - s * 0.03} y1={s * 0.425} x2={cx + s * 0.03} y2={s * 0.425} />
        </g>
      )}
      {/* 帽子 */}
      {hasHat && (
        <g>
          <rect x={cx - s * 0.22} y={s * 0.24} width={s * 0.44} height={s * 0.06} rx="2" fill="#374151" />
          <rect x={cx - s * 0.13} y={s * 0.12} width={s * 0.26} height={s * 0.13} rx="3" fill="#374151" />
        </g>
      )}
      {/* 嘴 */}
      {mouth}
      {/* 腮红（女性） */}
      {isFemale && (
        <>
          <ellipse cx={cx - s * 0.14} cy={s * 0.47} rx={s * 0.035} ry={s * 0.02} fill="#e8a0a0" opacity="0.5" />
          <ellipse cx={cx + s * 0.14} cy={s * 0.47} rx={s * 0.035} ry={s * 0.02} fill="#e8a0a0" opacity="0.5" />
        </>
      )}
    </svg>
  );
}

// ==================== 属性问题判断引擎 ====================
function checkBasicAttribute(card: BasicCard, attrType: string, value: string): boolean {
  switch (attrType) {
    case 'radical': return card.components.includes(value);
    case 'hsk': return card.hsk === parseInt(value);
    case 'hsk_lte': return card.hsk <= parseInt(value);
    case 'hsk_gte': return card.hsk >= parseInt(value);
    case 'tone': return card.firstTone === value;
    case 'charCount': return card.charCount === parseInt(value);
    case 'firstChar': return card.firstChar === value;
    case 'lastChar': return card.lastChar === value;
    case 'type': return card.type === value;
    default: return false;
  }
}

// 角色关键词 → attribute key 映射
const ROLE_PATTERNS: [RegExp, string][] = [
  [/学生/, '学生'], [/老师/, '老师'], [/运动员/, '运动员'],
  [/校长/, '校长'], [/保安/, '保安'], [/清洁工/, '清洁工'],
  [/图书管理员/, '图书管理员'], [/摄影师/, '摄影师'],
  [/卖东西的/, '卖东西的人'], [/游客/, '游客'],
  [/爸爸/, '爸爸'], [/妈妈/, '妈妈'], [/爷爷/, '爷爷'], [/奶奶/, '奶奶'],
  [/哥哥/, '哥哥'], [/姐姐/, '姐姐'], [/弟弟/, '弟弟'], [/妹妹/, '妹妹'],
  [/小朋友/, '小朋友'], [/老人/, '老人'],
  [/小孩|儿童/, '小朋友'], [/祖母|外婆/, '奶奶'], [/祖父|外公/, '爷爷'],
  [/父亲|爹/, '爸爸'], [/母亲|娘/, '妈妈'],
];

// 位置关键词 → attribute value 映射
const LOCATION_PATTERNS: [RegExp, string][] = [
  [/操场/, '操场'], [/食堂/, '食堂'], [/教室/, '教室'],
  [/图书馆/, '图书馆'], [/卧室/, '卧室'], [/厨房/, '厨房'],
  [/客厅/, '客厅'], [/花园/, '花园'], [/草地/, '草地'],
  [/树下/, '树下'], [/喷泉/, '喷泉旁'], [/长椅/, '长椅上'],
];

// 动作关键词 → attribute value 映射
const ACTION_PATTERNS: [RegExp, string][] = [
  [/在学习|读书/, '在学习'], [/在看书|看书/, '在看书'],
  [/在跑步|跑步/, '在跑步'], [/在做饭|做饭/, '在做饭'],
  [/在拍照|拍照/, '在拍照'], [/在写字|写字/, '在写字'],
  [/在吃饭|吃饭/, '在吃饭'], [/在睡觉|睡觉/, '在睡觉'],
  [/在唱歌|唱歌/, '在唱歌'], [/在喝水|喝水/, '在喝水'],
  [/在喝茶|喝茶/, '在喝茶'], [/在画画|画画/, '在画画'],
  [/在看电视|看电视/, '在看电视'], [/在买东西|买东西|购物/, '在买东西'],
  [/在休息|休息/, '在休息'], [/在打太极|打太极|太极/, '在打太极'],
  [/在打扫|打扫|打扫卫生/, '在打扫'], [/在打电话|打电话|打电话/, '在打电话'],
];

function checkAdvancedAttribute(card: AdvancedCard, question: string): { answer: boolean; confidence: number } {
  const q = question.trim();
  const attrs = card.attributes;

  // 先检查角色/职业
  for (const [pattern, roleValue] of ROLE_PATTERNS) {
    if (pattern.test(q)) {
      return { answer: attrs.role === roleValue, confidence: 1 };
    }
  }

  // 检查位置
  for (const [pattern, locValue] of LOCATION_PATTERNS) {
    if (pattern.test(q)) {
      return { answer: attrs.location === locValue, confidence: 1 };
    }
  }

  // 检查动作
  for (const [pattern, actValue] of ACTION_PATTERNS) {
    if (pattern.test(q)) {
      return { answer: attrs.action === actValue, confidence: 1 };
    }
  }

  // 外观属性（从SVG可见）
  const visualChecks: [RegExp[], string, any][] = [
    [[/男/, /男生/, /男人/, /男的/], 'gender', '男'],
    [[/女/, /女生/, /女人/, /女的/], 'gender', '女'],
    [[/年轻/, /young/], 'age', '年轻'],
    [[/中年/, /中年人/], 'age', '中年'],
    [[/老年/, /老人/, /年纪大/], 'age', '老年'],
    [[/眼镜/, /戴眼镜/], 'glasses', true],
    [[/帽子/, /戴帽/], 'hat', true],
    [[/红色/, /穿红/], 'clothesColor', 'red'],
    [[/蓝色/, /穿蓝/], 'clothesColor', 'blue'],
    [[/绿色/, /穿绿/], 'clothesColor', 'green'],
    [[/黄色/, /穿黄/], 'clothesColor', 'yellow'],
    [[/白色/, /穿白/], 'clothesColor', 'white'],
    [[/黑色/, /穿黑/], 'clothesColor', 'black'],
    [[/紫色/, /穿紫/], 'clothesColor', 'purple'],
    [[/橙色/, /穿橙/], 'clothesColor', 'orange'],
    [[/开心/, /高兴/, /笑/], 'expression', 'happy'],
    [[/难过/, /伤心/, /哭/], 'expression', 'sad'],
    [[/生气/, /愤怒/], 'expression', 'angry'],
    [[/惊讶/, /吃惊/], 'expression', 'surprised'],
    [[/短发/, /头发短/], 'hairStyle', 'short'],
    [[/长发/, /头发长/], 'hairStyle', 'long'],
    [[/光头/, /秃/], 'hairStyle', 'bald'],
  ];

  for (const [patterns, attr, expected] of visualChecks) {
    if (patterns.some(p => p.test(q))) {
      const val = attrs[attr];
      return { answer: val === expected, confidence: 1 };
    }
  }

  // 否定形式
  if (/不戴眼镜|没眼镜/.test(q)) return { answer: !attrs.glasses, confidence: 1 };
  if (/不戴帽|没帽/.test(q)) return { answer: !attrs.hat, confidence: 1 };

  return { answer: false, confidence: 0 };
}

// ==================== 生成房间ID ====================
const generateRoomId = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

// ==================== 主组件 ====================
export default function GuessWhoGame({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [level, setLevel] = useState<GameLevel>('basic');
  const [onlineMode, setOnlineMode] = useState<GameOnlineMode>('solo');
  const [selectedScene, setSelectedScene] = useState<string>('school');
  const [showPinyin, setShowPinyin] = useState(false);

  // 游戏状态
  const [boardCards, setBoardCards] = useState<BoardCard[]>([]);
  const [targetCard, setTargetCard] = useState<BasicCard | AdvancedCard | null>(null);
  const [guessInput, setGuessInput] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [questionHistory, setQuestionHistory] = useState<{ q: string; a: boolean; conf: number }[]>([]);
  const [gameResult, setGameResult] = useState<'win' | 'lose' | null>(null);
  const [feedback, setFeedback] = useState<string>('');
  const [_myFlipped, setMyFlipped] = useState<Set<string>>(new Set());

  // 联机状态
  const [role, setRole] = useState<OnlineRole>('host');
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [onlineError, setOnlineError] = useState('');
  const [_hasGuest, setHasGuest] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [_opponentFlipped, setOpponentFlipped] = useState<Set<string>>(new Set());
  const [pendingQuestion, setPendingQuestion] = useState<{ from: string; question: string } | null>(null);
  const [pendingGuess, setPendingGuess] = useState<{ from: string; guess: string } | null>(null);
  // opponentName reserved for future UI display
  void '对方'; // placeholder for opponentName
  const deviceId = getDeviceId();

  const questionInputRef = useRef<HTMLInputElement>(null);

  // ==================== 初始化游戏 ====================
  const startGame = useCallback((gameLevel: GameLevel, scene: string) => {
    let cards: (BasicCard | AdvancedCard)[];
    let target: BasicCard | AdvancedCard;

    if (gameLevel === 'basic') {
      const allCards = (basicData as any).cards as BasicCard[];
      const shuffled = [...allCards].sort(() => Math.random() - 0.5);
      cards = shuffled.slice(0, 12);
      target = cards[Math.floor(Math.random() * cards.length)];
    } else {
      const scenes = (advancedData as any).scenes;
      const sceneCards = scenes[scene]?.characters as AdvancedCard[] || [];
      const shuffled = [...sceneCards].sort(() => Math.random() - 0.5);
      cards = shuffled.slice(0, 12);
      target = cards[Math.floor(Math.random() * cards.length)];
    }

    setBoardCards(cards.map(c => ({ card: c, flipped: false })));
    setTargetCard(target);
    setQuestionHistory([]);
    setGameResult(null);
    setMyFlipped(new Set());
    setFeedback('');
    setPhase('playing');
  }, []);

  // ==================== 初级：属性问题 ====================
  const handleBasicQuestion = useCallback((attrType: string, value: string) => {
    if (!targetCard) return;
    const answer = checkBasicAttribute(targetCard as BasicCard, attrType, value);
    const qText = getQuestionText(attrType, value);
    setQuestionHistory(prev => [{ q: qText, a: answer, conf: 1 }, ...prev]);
    // 翻掉不符合的卡
    setBoardCards(prev => prev.map(bc => {
      if (bc.flipped) return bc;
      const matches = checkBasicAttribute(bc.card as BasicCard, attrType, value);
      return { ...bc, flipped: matches !== answer };
    }));
  }, [targetCard]);

  // ==================== 高级：自由提问 ====================
  const handleAdvancedQuestion = useCallback(() => {
    if (!questionInput.trim() || !targetCard) return;
    const q = questionInput.trim();
    const { answer, confidence } = checkAdvancedAttribute(targetCard as AdvancedCard, q);
    setQuestionHistory(prev => [{ q, a: answer, conf: confidence }, ...prev]);
    setQuestionInput('');

    if (confidence > 0) {
      // 翻掉不符合的卡
      setBoardCards(prev => prev.map(bc => {
        if (bc.flipped) return bc;
        const { answer: bcAnswer } = checkAdvancedAttribute(bc.card as AdvancedCard, q);
        return { ...bc, flipped: bcAnswer !== answer };
      }));
    } else {
      setFeedback('⚠️ 无法判断这个问题，请换一种问法');
      setTimeout(() => setFeedback(''), 2500);
    }
  }, [questionInput, targetCard]);

  // ==================== 猜答 ====================
  const handleGuess = useCallback(() => {
    if (!guessInput.trim() || !targetCard) return;
    const isChar = 'word' in targetCard;
    const target = isChar ? (targetCard as BasicCard).word : (targetCard as AdvancedCard).name;
    const isCorrect = guessInput.trim() === target;
    setGameResult(isCorrect ? 'win' : 'lose');
    setPhase('gameover');
  }, [guessInput, targetCard]);

  // ==================== 联机：创建房间 ====================
  const handleCreateRoom = useCallback(async () => {
    const id = generateRoomId();
    setOnlineError('');
    const gameLevel = level;
    const scene = selectedScene;
    // 随机选12张卡
    let cards: (BasicCard | AdvancedCard)[];
    if (gameLevel === 'basic') {
      const allCards = (basicData as any).cards as BasicCard[];
      cards = [...allCards].sort(() => Math.random() - 0.5).slice(0, 12);
    } else {
      const sceneCards = (advancedData as any).scenes[scene]?.characters as AdvancedCard[] || [];
      cards = [...sceneCards].sort(() => Math.random() - 0.5).slice(0, Math.min(12, sceneCards.length));
    }
    // 各自的目标卡是秘密，只存索引
    const hostTargetIdx = Math.floor(Math.random() * cards.length);
    const guestTargetIdx = Math.floor(Math.random() * cards.length);

    // UI-first: 立即跳转到等待房间，再异步写 Firebase
    setRoomId(id);
    setRole('host');
    setBoardCards(cards.map(c => ({ card: c, flipped: false })));
    setTargetCard(cards[hostTargetIdx]);
    setMyFlipped(new Set());
    setIsMyTurn(true);
    setPhase('waiting_room');

    try {
      const roomRef = ref(db, `guessWhoRooms/${id}`);
      await set(roomRef, {
        phase: 'waiting',
        level: gameLevel,
        scene,
        cards: JSON.stringify(cards),
        hostTargetIdx,
        guestTargetIdx,
        hostId: deviceId,
        guestId: null,
        currentTurn: 'host',
        pendingQuestion: null,
        hostFlipped: [],
        guestFlipped: [],
        winner: null,
        createdAt: serverTimestamp(),
      });
      onDisconnect(roomRef).remove();

      // 监听房间状态
      onValue(roomRef, (snap) => {
        const data = snap.val();
        if (!data) return;
        if (data.guestId && data.phase === 'playing') {
          setHasGuest(true);
          setIsMyTurn(data.currentTurn === 'host');
          setOpponentFlipped(new Set(data.guestFlipped || []));
          setPendingQuestion(data.pendingQuestion?.from === 'guest' ? data.pendingQuestion : null);
          // 处理对方的猜测
          if (data.pendingGuess?.from === 'guest') {
            setPendingGuess(data.pendingGuess);
            setPhase('answering');
          } else {
            setPendingGuess(null);
          }
          setPhase('playing');
        }
        if (data.winner) {
          const won = data.winner === 'host';
          setGameResult(won ? 'win' : 'lose');
          setPhase('gameover');
        }
      });
    } catch (err: any) {
      console.error('创建房间失败:', err);
      const errMsg = err?.message || '';
      if (errMsg.includes('permission') || errMsg.includes('Permission')) {
        setOnlineError('创建房间失败：服务器权限错误，请联系管理员');
      } else {
        setOnlineError('创建房间失败，请检查网络后重试');
      }
      setPhase('level_select');
    }
  }, [level, selectedScene, deviceId]);

  // ==================== 联机：加入房间 ====================
  const handleJoinRoom = useCallback(async () => {
    if (!joinRoomId.trim()) return;
    const id = joinRoomId.trim().toUpperCase();
    setOnlineError('');
    try {
      const roomRef = ref(db, `guessWhoRooms/${id}`);
      const snap = await get(roomRef);
      if (!snap.exists()) { setOnlineError('房间不存在'); return; }
      const data = snap.val();
      if (data.phase !== 'waiting') { setOnlineError('房间已开始'); return; }

      const cards: (BasicCard | AdvancedCard)[] = JSON.parse(data.cards);
      setRoomId(id);
      setRole('guest');
      setBoardCards(cards.map(c => ({ card: c, flipped: false })));
      setTargetCard(cards[data.guestTargetIdx]);
      setMyFlipped(new Set());
      setLevel(data.level);
      setSelectedScene(data.scene);
      setIsMyTurn(false);

      await update(roomRef, { guestId: deviceId, phase: 'playing' });

      // 监听
      onValue(roomRef, (snap) => {
        const d = snap.val();
        if (!d) return;
        setIsMyTurn(d.currentTurn === 'guest');
        setOpponentFlipped(new Set(d.hostFlipped || []));
        setPendingQuestion(d.pendingQuestion?.from === 'host' ? d.pendingQuestion : null);
        // 处理对方的猜测
        if (d.pendingGuess?.from === 'host') {
          setPendingGuess(d.pendingGuess);
          setPhase('answering');
        } else {
          setPendingGuess(null);
        }
        if (d.winner) {
          const won = d.winner === 'guest';
          setGameResult(won ? 'win' : 'lose');
          setPhase('gameover');
        }
      });

      setPhase('playing');
    } catch (err: any) {
      console.error('加入房间失败:', err);
      setOnlineError('加入房间失败，请检查网络后重试');
    }
  }, [joinRoomId, deviceId]);

  // ==================== 联机：提问 ====================
  const handleOnlineQuestion = useCallback(async (question: string) => {
    if (!roomId || !isMyTurn) return;
    const roomRef = ref(db, `guessWhoRooms/${roomId}`);
    await update(roomRef, {
      pendingQuestion: { from: role, question, timestamp: Date.now() },
      currentTurn: role === 'host' ? 'guest' : 'host',
    });
    setPhase('answering');
  }, [roomId, isMyTurn, role]);

  // ==================== 联机：回答问题 ====================
  const handleOnlineAnswer = useCallback(async (answer: boolean) => {
    if (!roomId || !pendingQuestion) return;
    const roomRef = ref(db, `guessWhoRooms/${roomId}`);
    const answerKey = role === 'host' ? 'hostAnswer' : 'guestAnswer';
    await update(roomRef, {
      [answerKey]: answer,
      pendingQuestion: null,
      currentTurn: role, // 问题答完后，继续问问题的人的回合
    });
    setPendingQuestion(null);
    setPhase('playing');

    // 本地翻牌（对方答完后，我自己决定翻哪些卡）
    // 答案会显示在历史里，用户手动翻牌
    setQuestionHistory(prev => [{ q: pendingQuestion.question, a: answer, conf: 1 }, ...prev]);
  }, [roomId, pendingQuestion, role]);

  // ==================== 联机：猜答 ====================
  // 猜答案流程：猜的人把答案发到 Firebase → 对方验证 → 写回结果
  const handleOnlineGuess = useCallback(async (guess: string) => {
    if (!roomId || !isMyTurn) return;
    const roomRef = ref(db, `guessWhoRooms/${roomId}`);
    // 写入我的猜测，等待对方验证
    await update(roomRef, {
      pendingGuess: { from: role, guess: guess.trim(), timestamp: Date.now() },
      currentTurn: role === 'host' ? 'guest' : 'host', // 猜完交给对方验证
    });
    setPhase('answering'); // 等待对方回答
  }, [roomId, isMyTurn, role]);

  // 验证对方的猜测
  const handleVerifyGuess = useCallback(async (isCorrect: boolean) => {
    if (!roomId || !pendingGuess) return;
    const roomRef = ref(db, `guessWhoRooms/${roomId}`);
    if (isCorrect) {
      // 对方猜对了，我输了
      await update(roomRef, {
        winner: pendingGuess.from,
        phase: 'gameover',
        pendingGuess: null,
      });
      setGameResult('lose');
      setPhase('gameover');
    } else {
      // 对方猜错了，继续游戏
      await update(roomRef, {
        pendingGuess: null,
        currentTurn: role, // 验证完后，轮到我提问/猜
      });
      setPendingQuestion(null);
      setPhase('playing');
      setFeedback(`❌ "${pendingGuess.guess}" 猜错了！你继续。`);
      setTimeout(() => setFeedback(''), 2500);
    }
  }, [roomId, pendingGuess, role]);

  // ==================== 工具函数 ====================
  const getActiveCount = () => boardCards.filter(bc => !bc.flipped).length;

  // ==================== 问题文本 ====================
  function getQuestionText(attrType: string, value: string): string {
    switch (attrType) {
      case 'radical': return `有偏旁"${value}"吗？`;
      case 'hsk': return `是 HSK${value} 的吗？`;
      case 'hsk_lte': return `是 HSK${value} 以下的吗？`;
      case 'tone': return `是第${value}声吗？`;
      case 'charCount': return `是 ${value} 个字吗？`;
      case 'firstChar': return `首字是"${value}"吗？`;
      case 'lastChar': return `尾字是"${value}"吗？`;
      case 'type': return value === 'char' ? `是单字吗？` : `是词语吗？`;
      default: return `${attrType} = ${value}？`;
    }
  }

  // ==================== 渲染 ====================

  // 主菜单
  if (phase === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex flex-col items-center justify-center p-4 text-white">
        <motion.div initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-4xl font-bold mb-2 whitespace-nowrap">猜猜我是谁</h1>
          <p className="text-indigo-200 text-lg">Tebak Siapa Aku</p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
          {/* 初级 */}
          <motion.button
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-5 text-left shadow-lg"
            onClick={() => { setLevel('basic'); setOnlineMode('solo'); startGame('basic', selectedScene); }}
          >
            <div className="text-2xl mb-1">📚 初级模式</div>
            <div className="text-sm text-emerald-100">猜汉字 / 词语</div>
            <div className="text-xs text-emerald-200 mt-1">Tingkat Dasar · Tebak Aksara Mandarin</div>
          </motion.button>

          {/* 高级 */}
          <motion.button
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-5 text-left shadow-lg"
            onClick={() => { setLevel('advanced'); setOnlineMode('solo'); setPhase('scene_select'); }}
          >
            <div className="text-2xl mb-1">👤 高级模式</div>
            <div className="text-sm text-violet-100">猜人物描述（读中文）</div>
            <div className="text-xs text-violet-200 mt-1">Tingkat Lanjut · Baca Deskripsi Mandarin</div>
          </motion.button>

          {/* 联机 PK */}
          <motion.button
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-5 text-left shadow-lg"
            onClick={() => { setOnlineMode('online'); setPhase('level_select'); }}
          >
            <div className="text-2xl mb-1">⚔️ 联机 PK</div>
            <div className="text-sm text-orange-100">和好友实时对战</div>
            <div className="text-xs text-orange-200 mt-1">Main Online Bersama Teman</div>
          </motion.button>
        </div>

        <button onClick={onExit} className="mt-8 text-indigo-300 hover:text-white text-sm">← 返回主菜单</button>
      </div>
    );
  }

  // 场景选择（高级）
  if (phase === 'scene_select') {
    const scenes = (advancedData as any).scenes;
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-900 to-purple-900 flex flex-col items-center justify-center p-4 text-white">
        <h2 className="text-3xl font-bold mb-8">选择场景</h2>
        <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
          {Object.entries(scenes).map(([key, scene]: [string, any]) => (
            <motion.button
              key={key}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              style={{ background: scene.bgColor }}
              className="rounded-2xl p-5 text-left shadow-lg text-gray-800"
              onClick={() => { setSelectedScene(key); startGame('advanced', key); }}
            >
              <div className="text-xl font-bold mb-1">{scene.sceneName}</div>
              <div className="text-sm text-gray-600">{scene.sceneNameId}</div>
            </motion.button>
          ))}
        </div>
        <button onClick={() => setPhase('menu')} className="mt-8 text-purple-300 hover:text-white text-sm">← 返回</button>
      </div>
    );
  }

  // 级别选择（联机）
  if (phase === 'level_select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-900 to-red-900 flex flex-col items-center justify-center p-4 text-white">
        <h2 className="text-3xl font-bold mb-8">⚔️ 联机 PK</h2>
        <div className="grid grid-cols-1 gap-4 w-full max-w-xs mb-6">
          {(['basic', 'advanced'] as GameLevel[]).map(lv => (
            <motion.button
              key={lv}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              className={`rounded-2xl p-5 text-left shadow-lg ${level === lv ? 'ring-4 ring-yellow-400' : ''} ${lv === 'basic' ? 'bg-emerald-600' : 'bg-violet-600'}`}
              onClick={() => setLevel(lv)}
            >
              <div className="text-xl font-bold">{lv === 'basic' ? '📚 初级' : '👤 高级'}</div>
            </motion.button>
          ))}
        </div>

        {level === 'advanced' && (
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-6">
            {Object.entries((advancedData as any).scenes).map(([key, scene]: [string, any]) => (
              <motion.button
                key={key}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                style={{ background: scene.bgColor }}
                className={`rounded-xl p-3 text-sm text-gray-800 font-bold ${selectedScene === key ? 'ring-4 ring-yellow-400' : ''}`}
                onClick={() => setSelectedScene(key)}
              >
                {scene.sceneName}
              </motion.button>
            ))}
          </div>
        )}

        <div className="w-full max-w-xs space-y-3">
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="w-full bg-yellow-500 rounded-2xl py-4 text-gray-900 font-bold text-lg shadow-lg"
            onClick={handleCreateRoom}
          >
            🏠 创建房间
          </motion.button>

          <div className="flex gap-2">
            <input
              className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 outline-none text-center tracking-widest uppercase"
              placeholder="输入房间码"
              value={joinRoomId}
              onChange={e => setJoinRoomId(e.target.value.toUpperCase())}
              maxLength={6}
            />
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="bg-white/20 rounded-xl px-4 font-bold"
              onClick={handleJoinRoom}
            >
              加入
            </motion.button>
          </div>
          {onlineError && <p className="text-red-300 text-sm text-center">{onlineError}</p>}
        </div>
        <button onClick={() => setPhase('menu')} className="mt-8 text-orange-300 hover:text-white text-sm">← 返回</button>
      </div>
    );
  }

  // 等待玩家（联机）
  if (phase === 'waiting_room') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-indigo-900 flex flex-col items-center justify-center p-6 text-white">
        <div className="text-5xl mb-6 animate-bounce">⏳</div>
        <h2 className="text-2xl font-bold mb-4">等待玩家加入...</h2>
        <div className="bg-white/10 rounded-2xl px-10 py-6 mb-8">
          <div className="text-gray-300 text-sm mb-1 text-center">房间码</div>
          <div className="text-5xl font-bold tracking-widest text-yellow-400">{roomId}</div>
        </div>
        <p className="text-gray-400 text-sm">把房间码发给好友，一起开始游戏！</p>
        <button onClick={() => { setPhase('menu'); remove(ref(db, `guessWhoRooms/${roomId}`)); }} className="mt-8 text-gray-400 hover:text-white text-sm">取消</button>
      </div>
    );
  }

  // 主游戏界面
  if (phase === 'playing' || phase === 'answering') {
    const activeCount = getActiveCount();
    const isBasic = level === 'basic';

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-indigo-950 flex flex-col text-white">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button onClick={() => setPhase('menu')} className="text-gray-400 hover:text-white">✕</button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-300">剩余 <span className="text-yellow-400 font-bold text-lg">{activeCount}</span> 张</span>
            {!isBasic && (
              <button
                className={`text-xs px-3 py-1 rounded-full ${showPinyin ? 'bg-indigo-500' : 'bg-white/10'}`}
                onClick={() => setShowPinyin(p => !p)}
              >
                拼音 {showPinyin ? '✓' : '○'}
              </button>
            )}
            {onlineMode === 'online' && (
            <>
              <span className={`text-xs px-3 py-1 rounded-full ${isMyTurn ? 'bg-green-600' : 'bg-gray-600'}`}>
                {isMyTurn ? '我的回合' : '等待对方'}
              </span>
              {/* 显示我自己的目标卡 */}
              {targetCard && (
                <span className="text-xs bg-yellow-700/60 text-yellow-200 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                  我的目标：{'word' in targetCard ? (targetCard as any).word : (targetCard as any).name}
                </span>
              )}
            </>
          )}
          </div>
          <span className="text-xs text-gray-400">{isBasic ? '初级' : '高级'}</span>
        </div>

        {/* 联机：对方提问要我回答 */}
        <AnimatePresence>
          {onlineMode === 'online' && pendingQuestion && (
            <motion.div
              initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
              className="mx-4 mb-2 bg-orange-600 rounded-xl p-3 text-center"
            >
              <p className="font-bold mb-2">对方问：{pendingQuestion.question}</p>
              <div className="flex gap-3 justify-center">
                <button className="bg-green-500 rounded-lg px-5 py-2 font-bold" onClick={() => handleOnlineAnswer(true)}>✓ 是</button>
                <button className="bg-red-500 rounded-lg px-5 py-2 font-bold" onClick={() => handleOnlineAnswer(false)}>✗ 不是</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 联机：对方猜答案要我验证 */}
        <AnimatePresence>
          {onlineMode === 'online' && pendingGuess && (
            <motion.div
              initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
              className="mx-4 mb-2 bg-purple-600 rounded-xl p-3 text-center"
            >
              <p className="font-bold mb-2">对方猜：<span className="text-yellow-300 text-lg">"{pendingGuess.guess}"</span></p>
              <p className="text-sm mb-2">是对方要找的答案吗？</p>
              <div className="flex gap-3 justify-center">
                <button className="bg-green-500 rounded-lg px-5 py-2 font-bold" onClick={() => handleVerifyGuess(true)}>✓ 猜对了！</button>
                <button className="bg-red-500 rounded-lg px-5 py-2 font-bold" onClick={() => handleVerifyGuess(false)}>✗ 猜错了</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 卡牌网格 */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <AnimatePresence>
              {boardCards.map((bc, idx) => {
                const card = bc.card;
                const isBasicCard = 'components' in card;
                return (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: bc.flipped ? 0.25 : 1, scale: 1 }}
                    transition={{ delay: idx * 0.015 }}
                    className={`relative rounded-xl overflow-hidden border-2 cursor-pointer select-none
                      ${bc.flipped ? 'border-gray-700 grayscale' : 'border-indigo-500/40 hover:border-indigo-400'}
                      ${card.id === targetCard?.id ? '' : ''}
                    `}
                    style={{ aspectRatio: '3/4', background: bc.flipped ? '#1e293b' : '#1e1b4b' }}
                    onClick={() => {
                      if (onlineMode === 'solo') {
                        setBoardCards(prev => prev.map((b, i) => i === idx ? { ...b, flipped: !b.flipped } : b));
                      }
                    }}
                  >
                    {isBasicCard ? (
                      // 初级卡面
                      <div className="flex flex-col items-center justify-center h-full p-1 text-center">
                        <div className="text-2xl font-bold text-white leading-none mb-1">{(card as BasicCard).word}</div>
                        <div className="text-xs text-indigo-300">{(card as BasicCard).pinyin}</div>
                        <div className="text-xs text-gray-400 mt-0.5 leading-tight">{(card as BasicCard).indonesian}</div>
                        <div className="mt-1 text-xs bg-indigo-800/60 rounded px-1">HSK{(card as BasicCard).hsk}</div>
                      </div>
                    ) : (
                      // 高级卡面
                      <div className="flex flex-col items-center justify-start h-full p-1.5 pt-2">
                        <AvatarSVG params={(card as AdvancedCard).avatarParams} size={56} />
                        <div className="text-xs font-bold text-white mt-1">{(card as AdvancedCard).name}</div>
                        {showPinyin && (
                          <div className="text-indigo-300 leading-snug text-center px-0.5 mt-1 text-[0.6rem] sm:text-xs break-words w-full">
                            {(card as AdvancedCard).descriptionPinyin}
                          </div>
                        )}
                        {!showPinyin && (
                          <div className="text-gray-300 leading-snug text-center px-0.5 mt-1 text-[0.65rem] sm:text-sm break-words w-full">
                            {(card as AdvancedCard).description}
                          </div>
                        )}
                      </div>
                    )}
                    {/* 翻掉覆盖层 */}
                    {bc.flipped && (
                      <div className="absolute inset-0 flex items-center justify-center text-2xl text-gray-600">✗</div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* 底部问题区 */}
        <div className="px-4 pb-4 pt-2 space-y-2 bg-black/30">
          {/* 问题历史 */}
          {questionHistory.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {questionHistory.slice(0, 5).map((h, i) => (
                <div key={i} className={`flex-shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${h.a ? 'bg-green-700' : 'bg-red-800'}`}>
                  {h.q.length > 10 ? h.q.slice(0, 10) + '…' : h.q} {h.a ? '✓' : '✗'}
                </div>
              ))}
            </div>
          )}

          {feedback && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-yellow-300 text-sm text-center">{feedback}</motion.div>
          )}

          {isBasic ? (
            <BasicQuestionPanel targetCard={targetCard as BasicCard} onAsk={handleBasicQuestion} disabled={onlineMode === 'online' && !isMyTurn} boardCards={boardCards} />
          ) : (
            // 高级：文字输入
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  ref={questionInputRef}
                  className="flex-1 bg-white/10 rounded-xl px-3 py-2.5 text-white placeholder-white/30 outline-none text-sm"
                  placeholder="输入问题（他戴眼镜吗？）"
                  value={questionInput}
                  onChange={e => setQuestionInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdvancedQuestion()}
                  disabled={onlineMode === 'online' && !isMyTurn}
                />
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className={`px-4 rounded-xl font-bold text-sm ${onlineMode === 'online' && !isMyTurn ? 'bg-gray-600' : 'bg-indigo-600'}`}
                  onClick={onlineMode === 'online' ? () => handleOnlineQuestion(questionInput) : handleAdvancedQuestion}
                  disabled={onlineMode === 'online' && !isMyTurn}
                >
                  问
                </motion.button>
              </div>
              <QuickQuestionButtons onAsk={(q) => setQuestionInput(q)} />
            </div>
          )}

          {/* 猜答区 */}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white/10 rounded-xl px-3 py-2.5 text-white placeholder-white/30 outline-none text-sm"
              placeholder={isBasic ? `输入答案猜字/词` : `输入人名猜答`}
              value={guessInput}
              onChange={e => setGuessInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (onlineMode === 'online' ? handleOnlineGuess(guessInput) : handleGuess())}
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="bg-yellow-500 text-gray-900 rounded-xl px-4 font-bold text-sm"
              onClick={() => onlineMode === 'online' ? handleOnlineGuess(guessInput) : handleGuess()}
            >
              猜！
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  // 游戏结束
  if (phase === 'gameover') {
    const isBasicCard = targetCard && 'word' in targetCard;
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-indigo-950 flex flex-col items-center justify-center p-6 text-white">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className="text-8xl mb-6">
          {gameResult === 'win' ? '🎉' : '😅'}
        </motion.div>
        <h2 className="text-3xl font-bold mb-2">{gameResult === 'win' ? '猜对了！' : '猜错了'}</h2>
        {gameResult === 'lose' && <p className="text-gray-300 mb-6">正确答案是：</p>}
        {targetCard && (
          <div className="bg-white/10 rounded-2xl p-6 mb-8 text-center min-w-[200px]">
            {isBasicCard ? (
              <>
                <div className="text-5xl font-bold mb-2">{(targetCard as BasicCard).word}</div>
                <div className="text-indigo-300">{(targetCard as BasicCard).pinyin}</div>
                <div className="text-gray-300">{(targetCard as BasicCard).indonesian}</div>
                <div className="text-sm text-gray-400 mt-1">HSK {(targetCard as BasicCard).hsk}</div>
              </>
            ) : (
              <>
                <AvatarSVG params={(targetCard as AdvancedCard).avatarParams} size={80} />
                <div className="text-2xl font-bold mt-2 mb-1">{(targetCard as AdvancedCard).name}</div>
                {showPinyin && <div className="text-xs sm:text-sm text-indigo-300 text-center max-w-md">{(targetCard as AdvancedCard).descriptionPinyin}</div>}
                <div className="text-sm sm:text-base text-gray-300 text-center max-w-md">{(targetCard as AdvancedCard).description}</div>
              </>
            )}
          </div>
        )}
        <div className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="bg-indigo-600 rounded-2xl px-6 py-3 font-bold"
            onClick={() => startGame(level, selectedScene)}
          >
            再来一局
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="bg-white/10 rounded-2xl px-6 py-3"
            onClick={() => setPhase('menu')}
          >
            回到菜单
          </motion.button>
        </div>
      </div>
    );
  }

  return null;
}

// ==================== 初级属性问题面板 ====================
function BasicQuestionPanel({ onAsk, disabled, boardCards }: {
  targetCard?: BasicCard | null;
  onAsk: (attrType: string, value: string) => void;
  disabled: boolean;
  boardCards: BoardCard[];
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // 从当前场上的卡中动态统计属性
  const activeCards = boardCards.filter(bc => !bc.flipped).map(bc => bc.card as BasicCard);

  const categories = [
    { id: 'type',      label: '类型',   icon: '📝' },
    { id: 'hsk',       label: 'HSK等级', icon: '📊' },
    { id: 'tone',      label: '声调',   icon: '🎵' },
    { id: 'charCount', label: '字数',   icon: '🔢' },
    { id: 'radical',   label: '偏旁',   icon: '🔤' },
    { id: 'firstChar', label: '首字',   icon: '🔠' },
  ];

  const getOptions = (cat: string): { label: string; value: string }[] => {
    switch (cat) {
      case 'type': {
        const hasChar = activeCards.some(c => c.type === 'char');
        const hasWord = activeCards.some(c => c.type === 'word');
        const opts = [];
        if (hasChar) opts.push({ label: '单字', value: 'char' });
        if (hasWord) opts.push({ label: '词语', value: 'word' });
        return opts;
      }
      case 'hsk': {
        const hsks = [...new Set(activeCards.map(c => c.hsk))].sort();
        return hsks.map(n => ({ label: `HSK${n}`, value: String(n) }));
      }
      case 'tone': return [
        { label: '第一声 (ā)', value: '1' },
        { label: '第二声 (á)', value: '2' },
        { label: '第三声 (ǎ)', value: '3' },
        { label: '第四声 (à)', value: '4' },
        { label: '轻声', value: '5' },
      ].filter(o => activeCards.some(c => c.firstTone === o.value));
      case 'charCount': {
        const counts = [...new Set(activeCards.map(c => c.charCount))].sort();
        return counts.map(n => ({ label: `${n}个字`, value: String(n) }));
      }
      case 'radical': {
        // 统计当前场上卡实际拥有的偏旁，按出现次数排序
        const counts: Record<string, number> = {};
        activeCards.forEach(c => c.components.forEach(r => { counts[r] = (counts[r] || 0) + 1; }));
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([r, cnt]) => ({ label: `${r} (${cnt})`, value: r }));
      }
      case 'firstChar': {
        const chars = [...new Set(activeCards.map(c => c.firstChar))].sort();
        return chars.map(c => ({ label: c, value: c }));
      }
      default: return [];
    }
  };

  return (
    <div className="space-y-2">
      {/* 类别选择 */}
      <div className="flex gap-1.5 flex-wrap">
        {categories.map(cat => (
          <motion.button
            key={cat.id}
            whileTap={{ scale: 0.95 }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${activeCategory === cat.id ? 'bg-indigo-500' : 'bg-white/10'}`}
            onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
            disabled={disabled}
          >
            {cat.icon} {cat.label}
          </motion.button>
        ))}
      </div>

      {/* 值选择 */}
      <AnimatePresence>
        {activeCategory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex gap-1.5 flex-wrap overflow-hidden"
          >
            {getOptions(activeCategory).map(opt => (
              <motion.button
                key={opt.value}
                whileTap={{ scale: 0.9 }}
                className="px-3 py-1.5 rounded-xl text-xs bg-indigo-700 hover:bg-indigo-600 font-bold"
                onClick={() => { onAsk(activeCategory, opt.value); setActiveCategory(null); }}
                disabled={disabled}
              >
                {opt.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==================== 高级快速问题按钮 ====================
function QuickQuestionButtons({ onAsk }: { onAsk: (q: string) => void }) {
  const quickQuestions = [
    '他是男的吗？', '她是女的吗？',
    '他是学生吗？', '他是老师吗？', '他是运动员吗？',
    '他戴眼镜吗？', '他戴帽子吗？',
    '他穿红色衣服吗？', '他穿蓝色衣服吗？',
    '他很开心吗？', '他是年轻人吗？', '他是中年人吗？',
    '他在看书吗？', '他在跑步吗？', '他在做饭吗？',
    '他在操场上吗？', '他在教室里吗？',
  ];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {quickQuestions.map((q, i) => (
        <motion.button
          key={i}
          whileTap={{ scale: 0.9 }}
          className="px-2 py-1 rounded-lg text-xs bg-purple-800/60 hover:bg-purple-700"
          onClick={() => onAsk(q)}
        >
          {q}
        </motion.button>
      ))}
    </div>
  );
}
