import { useState, useEffect } from 'react';
import GameBoard from './GameBoard'
import HeartbeatGame from './HeartbeatGame'
import HeartbeatGameOnline from './HeartbeatGameOnline'
import PairGame from './PairGame'
import GuessWhoGame from './GuessWhoGame'
import { getDeviceId, getDeviceInfo } from './deviceId';
import { db } from './firebase';
import { ref, set, serverTimestamp } from 'firebase/database';
import { getApp } from 'firebase/app';

function App() {
  const [mode, setMode] = useState<'main' | 'heartbeat' | 'heartbeat-on-line' | 'pair' | 'guess-who'>('main');
  const [initialRoomId, setInitialRoomId] = useState<string>('');

  // 初始化：检测 URL 房间号参数 + 记录设备访问 + Firebase Analytics
  useEffect(() => {
    // 检测 URL 中的房间号参数
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      setInitialRoomId(roomFromUrl.toUpperCase());
      setMode('heartbeat-on-line');
      // 清理 URL（移除 room 参数，避免刷新时重复处理）
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
    // 记录设备访问
    const recordVisit = async () => {
      const deviceId = getDeviceId();
      const info = getDeviceInfo();

      try {
        const now = Date.now();
        const dateStr = new Date(now).toISOString(); // e.g. "2026-05-23T05:01:00.000Z"
        await set(ref(db, `visits/${deviceId}`), {
          lastVisit: serverTimestamp(),
          lastVisitStr: dateStr,
          platform: info.platform,
          language: info.language,
          isMobile: info.isMobile,
          screenWidth: info.screenWidth,
        });

        await set(ref(db, `players/${deviceId}`), {
          lastActive: serverTimestamp(),
          lastActiveStr: dateStr,
          lastVisitAt: serverTimestamp(),
          lastVisitAtStr: dateStr,
          platform: info.platform,
          language: info.language,
          isMobile: info.isMobile,
          lastVisitPlatform: info.platform,
        });
      } catch (e: any) {
        console.warn('[App] Visit recording failed:', e?.message);
      }
    };

    recordVisit();

    // Firebase Analytics 初始化（动态加载，避免 SSR 报错）
    const initAnalytics = async () => {
      try {
        const { getAnalytics, logEvent } = await import('firebase/analytics');
        const analytics = getAnalytics(getApp());
        logEvent(analytics, 'page_view', {
          device_platform: getDeviceInfo().platform,
          is_mobile: getDeviceInfo().isMobile,
        });
      } catch (e) {
        // Analytics 加载失败不影响游戏
      }
    };

    initAnalytics();
  }, []);

  if (mode === 'heartbeat') {
    return <HeartbeatGame onExit={() => setMode('main')} />;
  }

  if (mode === 'heartbeat-on-line') {
    return <HeartbeatGameOnline onExit={() => setMode('main')} initialRoomId={initialRoomId} />;
  }

  if (mode === 'pair') {
    return <PairGame onExit={() => setMode('main')} />;
  }

  if (mode === 'guess-who') {
    return <GuessWhoGame onExit={() => setMode('main')} />;
  }

  return <GameBoard onEnterHeartbeat={() => setMode('heartbeat')} onEnterHeartbeatOnline={() => setMode('heartbeat-on-line')} onEnterPair={() => setMode('pair')} onEnterGuessWho={() => setMode('guess-who')} />;
}

export default App;
