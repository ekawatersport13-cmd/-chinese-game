import { useState } from 'react';
import GameBoard from './GameBoard'
import HeartbeatGame from './HeartbeatGame'
import HeartbeatGameOnline from './HeartbeatGameOnline'

function App() {
  const [mode, setMode] = useState<'main' | 'heartbeat' | 'heartbeat-online'>('main');

  if (mode === 'heartbeat') {
    return <HeartbeatGame onExit={() => setMode('main')} />;
  }

  if (mode === 'heartbeat-online') {
    return <HeartbeatGameOnline onExit={() => setMode('main')} />;
  }

  return <GameBoard onEnterHeartbeat={() => setMode('heartbeat')} onEnterHeartbeatOnline={() => setMode('heartbeat-online')} />;
}

export default App;
