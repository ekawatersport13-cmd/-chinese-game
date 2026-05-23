// 设备 ID 管理 - 基于 localStorage 的持久化用户标识

const STORAGE_KEY = 'hanzi_game_device_id';

/**
 * 获取或创建设备 ID
 * 首次访问时生成随机ID并存到 localStorage
 * 后续访问读取已有ID
 */
export function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(STORAGE_KEY);
    if (deviceId) {
      return deviceId;
    }
    // 生成新 ID: "U" + 8位随机字符
    deviceId = 'U' + Math.random().toString(36).substring(2, 10).toUpperCase();
    localStorage.setItem(STORAGE_KEY, deviceId);
    return deviceId;
  } catch {
    // localStorage 不可用时 fallback
    return 'U' + Math.random().toString(36).substring(2, 10).toUpperCase();
  }
}

/**
 * 获取设备信息（用于统计分析）
 */
export function getDeviceInfo(): {
  userAgent: string;
  platform: string;
  language: string;
  screenWidth: number;
  screenHeight: number;
  isMobile: boolean;
} {
  const ua = navigator.userAgent;
  let platform = 'unknown';
  if (/iPhone|iPad|iPod/.test(ua)) platform = 'ios';
  else if (/Android/.test(ua)) platform = 'android';
  else if (/Windows/.test(ua)) platform = 'windows';
  else if (/Mac/.test(ua)) platform = 'mac';
  else if (/Linux/.test(ua)) platform = 'linux';

  return {
    userAgent: ua,
    platform,
    language: navigator.language,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    isMobile: /Mobi|Android|iPhone|iPad/.test(ua),
  };
}
