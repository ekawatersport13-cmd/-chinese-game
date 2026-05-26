import { useState, useEffect } from 'react';
import GameBoard from './GameBoard'
import HeartbeatGame from './HeartbeatGame'
import HeartbeatGameOnline from './HeartbeatGameOnline'
import PairGame from './PairGame'
import GuessWhoGame from './GuessWhoGame'
import RingBellGame from './RingBellGame'
import RingBellGameOnline from './RingBellGameOnline'
import BackgroundMusic from './BackgroundMusic'
import { getDeviceId, getDeviceInfo } from './deviceId';
import { db } from './firebase';
import { ref, set, serverTimestamp } from 'firebase/database';
import { getApp } from 'firebase/app';

function App() {
  const [mode, setMode] = useState<'main' | 'heartbeat' | 'heartbeat-on-line' | 'pair' | 'guess-who' | 'ringbell' | 'ringbell-online'>('main');
  const [initialRoomId, setInitialRoomId] = useState<string>('');

  // 初始化：检测 URL 房间号参数 + sessionStorage 恢复 + 记录设备访问
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
    } else {
      // 没有URL参数时，检查 sessionStorage 是否有联机房间
      try {
        const saved = sessionStorage.getItem('hb_online_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.roomId) {
            setInitialRoomId('');
            setMode('heartbeat-on-line');
          }
        }
      } catch {}
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
    return <><HeartbeatGame onExit={() => setMode('main')} /><BackgroundMusic style="chinese" /></>;
  }

  if (mode === 'heartbeat-on-line') {
    return <><HeartbeatGameOnline onExit={() => setMode('main')} initialRoomId={initialRoomId} /><BackgroundMusic style="celtic" /></>;
  }

  if (mode === 'pair') {
    return <><PairGame onExit={() => setMode('main')} /><BackgroundMusic style="soft" /></>;
  }

  if (mode === 'guess-who') {
    return <><GuessWhoGame onExit={() => setMode('main')} /><BackgroundMusic style="soft" /></>;
  }

  if (mode === 'ringbell') {
    return <><RingBellGame onExit={() => setMode('main')} /><BackgroundMusic style="chinese" /></>;
  }

  if (mode === 'ringbell-online') {
    return <><RingBellGameOnline onExit={() => setMode('main')} initialRoomId={initialRoomId} /><BackgroundMusic style="chinese" /></>;
  }

  return <><GameBoard onEnterHeartbeat={() => setMode('heartbeat')} onEnterHeartbeatOnline={() => setMode('heartbeat-on-line')} onEnterPair={() => setMode('pair')} onEnterGuessWho={() => setMode('guess-who')} onEnterRingBell={() => setMode('ringbell')} onEnterRingBellOnline={() => setMode('ringbell-online')} /><BackgroundMusic style="soft" defaultEnabled /></>;
}

export default App;
