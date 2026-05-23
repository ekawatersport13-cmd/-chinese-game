import { ref, push, update, increment } from 'firebase/database';
import { db } from './firebase';
import { getDeviceId, getDeviceInfo } from './deviceId';
import { checkRateLimit } from './security';

// ==================== Session Manager ====================

let currentSessionId: string | null = null;
let gameStartTime: number = 0;
let gameStartMode: string = '';
let wordLog: Array<{ word: string; correct: boolean; timestamp: number; pinyin?: string; meaning?: string }> = [];

export function startSession(gameMode: string, extra?: Record<string, any>) {
  // 防刷：每个用户每分钟最多创建 10 个 session
  if (!checkRateLimit('startSession', 10, 60000)) return;

  currentSessionId = `sess_${Date.now()}`;
  gameStartTime = Date.now();
  gameStartMode = gameMode;
  wordLog = [];

  const sessionId = currentSessionId;
  const deviceId = getDeviceId();
  const info = getDeviceInfo();

  push(ref(db, `gameSessions/${deviceId}`), {
    sessionId,
    gameMode,
    role: extra?.role || 'player',
    difficulty: extra?.difficulty || null,
    settings: extra?.settings || null,
    startedAt: Date.now(),
    startedAtStr: new Date().toISOString(),
    platform: info.platform,
    isMobile: info.isMobile,
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight,
    language: info.language,
  }).catch(() => {});
}

export function logWord(word: string, correct: boolean, pinyin?: string, meaning?: string) {
  if (!currentSessionId) return;

  // 防刷：每秒最多记录 30 个词
  if (!checkRateLimit('logWord', 30, 1000)) return;

  const entry = { word, correct, timestamp: Date.now(), pinyin, meaning };
  wordLog.push(entry);

  const deviceId = getDeviceId();
  push(ref(db, `gameSessions/${deviceId}/${currentSessionId}/words`), {
    ...entry,
    elapsed: Date.now() - gameStartTime,
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
  const nowStr = new Date().toISOString();

  // Write session summary
  push(ref(db, `gameSessions/${deviceId}/${currentSessionId}/summary`), {
    endedAt: Date.now(),
    endedAtStr: nowStr,
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

  // Update /players/{deviceId} summary fields
  const durationMins = Math.round(durationMs / 60000);
  update(ref(db, `players/${deviceId}`), {
    lastActive: Date.now(),
    lastActiveStr: nowStr,
    lastScore: result.score,
    lastGameMode: gameStartMode,
    totalGames: increment(1),
    totalPlayTimeMinutes: increment(durationMins || 1),
    totalScore: increment(result.score),
  }).catch(() => {});

  // Reset
  currentSessionId = null;
  gameStartTime = 0;
  gameStartMode = '';
  wordLog = [];
}
