// ==================== Rate Limiter ====================
// 客户端速率限制 — 防止脚本刷房间/打点

const rateLimits: Record<string, { count: number; resetAt: number }> = {};

/**
 * 检查是否超过频率限制
 * @param action 操作名称（如 'createRoom', 'startSession', 'logWord'）
 * @param maxCount 时间窗口内允许的最大次数
 * @param windowMs 时间窗口（毫秒）
 * @returns true = 允许执行, false = 被限流
 */
export function checkRateLimit(
  action: string,
  maxCount: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = rateLimits[action];

  if (!entry || now > entry.resetAt) {
    rateLimits[action] = { count: 1, resetAt: now + windowMs };
    return true;
  }

  if (entry.count >= maxCount) {
    return false;
  }

  entry.count++;
  return true;
}

// ==================== Bot Detection ====================

interface BotSignal {
  isBot: boolean;
  score: number;        // 0~100, 越高越可能是 bot
  reasons: string[];
}

/**
 * 基础 bot 检测（客户端）
 * 检测开发者工具、无头浏览器、自动化框架
 */
export function detectBot(): BotSignal {
  const score: number[] = [];
  const reasons: string[] = [];

  // 1. 检测 navigator.webdriver（Selenium/Puppeteer 会设为 true）
  const nav = navigator as any;
  if (nav.webdriver === true) {
    score.push(50);
    reasons.push('webdriver=true');
  }

  // 2. 检测 Chrome DevTools Protocol
  if (nav.webdriver === undefined && !/Chrome/.test(navigator.userAgent)) {
    score.push(10);
    reasons.push('no-chrome-ua');
  }

  // 3. 检测是否有过快的操作（鼠标移动速度异常）
  // 这个需要在游戏逻辑中配合检测

  // 4. 检测 window 尺寸是否异常（headless browser 常见尺寸）
  if (window.innerWidth === 0 || window.innerHeight === 0) {
    score.push(30);
    reasons.push('zero-screen');
  }

  // 5. 检测是否有真实的鼠标/触摸交互
  if (!(window as any)._hasUserInteraction) {
    score.push(15);
    reasons.push('no-interaction');
  }

  const totalScore = score.reduce((a, b) => a + b, 0);

  return {
    isBot: totalScore >= 50,
    score: Math.min(totalScore, 100),
    reasons,
  };
}

// ==================== Interaction Tracker ====================

// 记录用户是否有真实交互（鼠标移动、触摸、点击）
if (typeof window !== 'undefined') {
  (window as any)._hasUserInteraction = false;

  const markInteraction = () => {
    (window as any)._hasUserInteraction = true;
  };

  window.addEventListener('mousemove', markInteraction, { once: true, passive: true });
  window.addEventListener('touchstart', markInteraction, { once: true, passive: true });
  window.addEventListener('click', markInteraction, { once: true, passive: true });
  window.addEventListener('keydown', markInteraction, { once: true, passive: true });
}

/**
 * 检查用户是否有真实交互记录
 * 用于关键操作前验证
 */
export function hasRealInteraction(): boolean {
  return !!(window as any)._hasUserInteraction;
}
