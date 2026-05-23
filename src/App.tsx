import { useState, useEffect } from 'react';
import GameBoard from './GameBoard'
import HeartbeatGame from './HeartbeatGame'
import HeartbeatGameOnline from './HeartbeatGameOnline'
import { getDeviceId, getDeviceInfo } from './deviceId';
import { db } from './firebase';
import { ref, set, serverTimestamp } from 'firebase/database';
import { getApp } from 'firebase/app';

function App() {
  const [mode, setMode] = useState<'main' | 'heartbeat' | 'heartbeat-on-line'>('main');

  // 初始化：记录设备访问 + Firebase Analytics
  useEffect(() => {
    // 记录设备访问
    const recordVisit = async () => {
      const deviceId = getDeviceId();
      const info = getDeviceInfo();

      try {
        await set(ref(db, `visits/${deviceId}`), {
          lastVisit: serverTimestamp(),
          platform: info.platform,
          language: info.language,
          isMobile: info.isMobile,
          screenWidth: info.screenWidth,
        });

        await set(ref(db, `players/${deviceId}`), {
          lastActive: serverTimestamp(),
          platform: info.platform,
          language: info.language,
          isMobile: info.isMobile,
          lastVisitAt: serverTimestamp(),
        });
      } catch (e) {
        console.log('Visit recording failed:', e);
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
    return <HeartbeatGameOnline onExit={() => setMode('main')} />;
  }

  return <GameBoard onEnterHeartbeat={() => setMode('heartbeat')} onEnterHeartbeatOnline={() => setMode('heartbeat-on-line')} />;
}

export default App;
