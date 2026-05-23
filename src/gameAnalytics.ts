import { ref, push } from 'firebase/database';
import { db } from './firebase';
import { getDeviceId, getDeviceInfo } from './deviceId';
import { checkRateLimit } from './security';

// ==================== Session Manager ====================

let currentSessionId: string | null = null;
let gameStartTime: number = 0;
let wordLog: Array<{ word: string; correct: boolean; timestamp: number; pinyin?: string; meaning?: string }> = [];

export function startSession(gameMode: string, extra?: Record<string, any>) {
  // 防刷：每个用户每分钟最多创建 10 个 session
  if (!checkRateLimit('startSession', 10, 60000)) return;

  currentSessionId = `sess_${Date.now()}`;
  gameStartTime = Date.now();
  wordLog = [];

  const sessionId = currentSessionId;
  const deviceId = getDeviceId();
  const info = getDeviceInfo();

  // Write session header
  push(ref(db, `gameSessions/${deviceId}`), {
    sessionId,
    gameMode,         // 'compose' | 'find' | 'chain' | 'heartbeat' | 'heartbeat-online'
    role: extra?.role || 'player',  // 'host' | 'guest' | 'player'
    difficulty: extra?.difficulty || null,
    settings: extra?.settings || null,  // e.g. { duration: 60, timed: true }
    startedAt: Date.now(),
    platform: info.platform,
    isMobile: info.isMobile,
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight,
    language: info.language,
  }).catch(() => {});
}

export function logWord(word: string, correct: boolean, pinyin?: string, meaning?: string) {
  if (!currentSessionId) return;

  // 防刷：每秒最多记录 30 个词（正常人类打字速度上限）
  if (!checkRateLimit('logWord', 30, 1000)) return;

  const entry = { word, correct, timestamp: Date.now(), pinyin, meaning };
  wordLog.push(entry);

  // Real-time write each word (fire-and-forget)
  const deviceId = getDeviceId();
  push(ref(db, `gameSessions/${deviceId}/${currentSessionId}/words`), {
    ...entry,
    elapsed: Date.now() - gameStartTime,  // seconds since game start
  }).catch(() => {});
}

export function endSession(result: {
  score: number;
  correct?: number;
  wrong?: number;
  maxCombo?: number;
  extra?: Record<string, any>;
}) {
  if (!currentSessionId) return;

  const durationMs = Date.now() - gameStartTime;
  const deviceId = getDeviceId();

  // Write session summary
  push(ref(db, `gameSessions/${deviceId}/${currentSessionId}/summary`), {
    endedAt: Date.now(),
    durationSeconds: Math.round(durationMs / 1000),
    score: result.score,
    correct: result.correct ?? 0,
    wrong: result.wrong ?? 0,
    maxCombo: result.maxCombo ?? 0,
    totalWordsTyped: wordLog.length,
    correctWords: wordLog.filter(w => w.correct).length,
    wrongWords: wordLog.filter(w => !w.correct).length,
    allWordsTyped: wordLog.map(w => w.word),
    ...result.extra,
  }).catch(() => {});

  // Reset
  currentSessionId = null;
  gameStartTime = 0;
  wordLog = [];
}
