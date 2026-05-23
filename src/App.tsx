import { useState, useEffect } from 'react';
import GameBoard from './GameBoard'
import HeartbeatGame from './HeartbeatGame'
import HeartbeatGameOnline from './HeartbeatGameOnline'
import { getDeviceId, getDeviceInfo } from './deviceId';
import { db } from './firebase';
import { ref, set, serverTimestamp } from 'firebase/database';

function App() {
  const [mode, setMode] = useState<'main' | 'heartbeat' | 'heartbeat-online'>('main');

  // 初始化：记录设备访问
  useEffect(() => {
    const recordVisit = async () => {
      const deviceId = getDeviceId();
      const info = getDeviceInfo();

      try {
        // 记录到 /visits/{deviceId} - 每次访问更新
        await set(ref(db, `visits/${deviceId}`), {
          lastVisit: serverTimestamp(),
          platform: info.platform,
          language: info.language,
          isMobile: info.isMobile,
          screenWidth: info.screenWidth,
        });

        // 更新 /players/{deviceId} 的统计信息
        await set(ref(db, `players/${deviceId}`), {
          lastActive: serverTimestamp(),
          platform: info.platform,
          language: info.language,
          isMobile: info.isMobile,
          totalVisits: serverTimestamp(),
        });
      } catch (e) {
        console.log('Visit recording failed:', e);
      }
    };

    recordVisit();
  }, []);

  if (mode === 'heartbeat') {
    return <HeartbeatGame onExit={() => setMode('main')} />;
  }

  if (mode === 'heartbeat-online') {
    return <HeartbeatGameOnline onExit={() => setMode('main')} />;
  }

  return <GameBoard onEnterHeartbeat={() => setMode('heartbeat')} onEnterHeartbeatOnline={() => setMode('heartbeat-online')} />;
}

export default App;
