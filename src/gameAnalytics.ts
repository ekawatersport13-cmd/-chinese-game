import { ref, push, update, get, set, serverTimestamp } from 'firebase/database';
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
    startedAt: serverTimestamp(),
    startedAtStr: new Date().toISOString(),
    platform: info.platform,
    isMobile: info.isMobile,
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight,
    language: info.language,
  }).catch((err) => {
    console.warn('[Analytics] startSession write failed:', err?.message);
  });
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
  }).catch((err) => {
    console.warn('[Analytics] logWord write failed:', err?.message);
  });
}

/**
 * 安全地将一个数字字段递增（替代 increment()，避免 Firebase 规则 .validate 冲突）
 */
async function incrementField(path: string, field: string, delta: number) {
  try {
    const snap = await get(ref(db, `${path}/${field}`));
    const current = snap.exists() ? Number(snap.val()) || 0 : 0;
    await set(ref(db, `${path}/${field}`), current + delta);
  } catch (err) {
    console.warn(`[Analytics] incrementField failed: ${path}/${field}`, String(err));
  }
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
  const durationMins = Math.max(1, Math.round(durationMs / 60000));

  // Write session summary
  push(ref(db, `gameSessions/${deviceId}/${currentSessionId}/summary`), {
    endedAt: serverTimestamp(),
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
  }).catch((err) => {
    console.warn('[Analytics] endSession summary write failed:', err?.message);
  });

  // Update /players/{deviceId} — 用 read-modify-write 替代 increment()
  const playerPath = `players/${deviceId}`;

  // 先写入非递增字段
  update(ref(db, playerPath), {
    lastActive: serverTimestamp(),
    lastActiveStr: nowStr,
    lastScore: result.score,
    lastGameMode: gameStartMode,
  }).catch((err) => {
    console.warn('[Analytics] endSession player update failed:', err?.message);
  });

  // 递增字段：read-modify-write（避免 increment() 与 .validate 冲突）
  incrementField(playerPath, 'totalGames', 1);
  incrementField(playerPath, 'totalPlayTimeMinutes', durationMins);
  incrementField(playerPath, 'totalScore', result.score);

  // Reset
  currentSessionId = null;
  gameStartTime = 0;
  gameStartMode = '';
  wordLog = [];
}
