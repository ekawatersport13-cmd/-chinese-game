import { useState, useEffect, useCallback, useRef } from 'react';

// ==================== Web Audio 纯乐器音乐生成器 ====================

const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
let globalCtx: AudioContext | null = null;
let globalGain: GainNode | null = null;

function getAudioCtx(): { ctx: AudioContext; gain: GainNode } {
  if (!globalCtx) {
    globalCtx = new AudioCtx();
    globalGain = globalCtx.createGain();
    globalGain.connect(globalCtx.destination);
  }
  return { ctx: globalCtx, gain: globalGain! };
}

// 五声音阶频率表（宫商角徵羽 - 中国风）
const PENTATONIC = [
  261.63, 293.66, 329.63, 392.00, 440.00, // C4 D4 E4 G4 A4
  523.25, 587.33, 659.25, 783.99, 880.00, // C5 D5 E5 G5 A5
];

// 凯尔特风小调音阶
const CELTIC_MINOR = [
  293.66, 329.63, 349.23, 392.00, 440.00, // D4 E4 F4 G4 A4
  466.16, 523.25, 587.33, 659.25, 698.46, // Bb4 C5 D5 E5 F5
];

// 柔和大调音阶
const SOFT_MAJOR = [
  261.63, 293.66, 329.63, 349.23, 392.00, // C4 D4 E4 F4 G4
  440.00, 523.25, 587.33, 659.25, 698.46, // A4 C5 D5 E5 F5
];

type MusicStyle = 'chinese' | 'celtic' | 'soft';

function getScale(style: MusicStyle): number[] {
  switch (style) {
    case 'chinese': return PENTATONIC;
    case 'celtic': return CELTIC_MINOR;
    case 'soft': return SOFT_MAJOR;
  }
}

// 播放单个音符
function playNote(
  ctx: AudioContext,
  dest: GainNode,
  freq: number,
  startTime: number,
  duration: number,
  volume: number = 0.12,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = type;
  osc.frequency.value = freq;

  // 低通滤波让声音更柔和
  filter.type = 'lowpass';
  filter.frequency.value = 2000;
  filter.Q.value = 1;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.05);
  gain.gain.setValueAtTime(volume, startTime + duration - 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

// 生成一小段旋律
function generateMelody(
  ctx: AudioContext,
  dest: GainNode,
  scale: number[],
  startTime: number,
  noteDuration: number,
  volume: number,
  style: MusicStyle,
) {
  const numNotes = 4 + Math.floor(Math.random() * 4); // 4-7 notes
  let t = startTime;
  let prevIdx = Math.floor(Math.random() * 5); // start from lower range

  for (let i = 0; i < numNotes; i++) {
    // 随机走动，但倾向于级进
    const step = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    let idx = prevIdx + step;
    idx = Math.max(0, Math.min(scale.length - 1, idx));

    const freq = scale[idx];
    const type: OscillatorType = style === 'chinese' ? 'triangle' : 'sine';

    // 偶尔加入和声
    if (Math.random() > 0.6 && style !== 'chinese') {
      playNote(ctx, dest, freq * 0.5, t, noteDuration, volume * 0.3, 'sine'); // 低八度
    }

    playNote(ctx, dest, freq, t, noteDuration * 0.9, volume, type);

    // 偶尔插入休止符
    const gap = Math.random() > 0.3 ? noteDuration : noteDuration * 2;
    t += gap;
    prevIdx = idx;
  }

  return t; // 返回结束时间
}

// 播放和弦垫底（背景氛围）
function playPad(
  ctx: AudioContext,
  dest: GainNode,
  scale: number[],
  startTime: number,
  duration: number,
  volume: number,
) {
  const rootIdx = Math.floor(Math.random() * 5);
  const root = scale[rootIdx];
  // 简单三和弦 (根音 + 五度)
  const fifth = root * 1.5;

  [root * 0.5, root, fifth].forEach(freq => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.value = freq;

    filter.type = 'lowpass';
    filter.frequency.value = 800;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume * 0.04, startTime + 1);
    gain.gain.setValueAtTime(volume * 0.04, startTime + duration - 1);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  });
}

// 持续音乐生成器
class MusicGenerator {
  private ctx: AudioContext;
  private dest: GainNode;
  private scale: number[];
  private style: MusicStyle;
  private timerRef: number | null = null;
  private volume: number = 1;
  private isPlaying = false;
  private nextNoteTime = 0;

  constructor(style: MusicStyle) {
    const { ctx, gain } = getAudioCtx();
    this.ctx = ctx;
    this.dest = gain;
    this.scale = getScale(style);
    this.style = style;
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.scheduleLoop();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerRef) {
      clearTimeout(this.timerRef);
      this.timerRef = null;
    }
  }

  setVolume(v: number) {
    this.volume = v;
  }

  private scheduleLoop() {
    if (!this.isPlaying) return;

    const now = this.ctx.currentTime;
    if (this.nextNoteTime < now) {
      this.nextNoteTime = now;
    }

    const noteDuration = this.style === 'chinese' ? 0.5 : 0.4;

    // 旋律
    const endTime = generateMelody(
      this.ctx, this.dest, this.scale,
      this.nextNoteTime, noteDuration,
      0.15 * this.volume, this.style,
    );

    // 和弦垫底（每4-8个旋律循环一次）
    if (Math.random() > 0.5) {
      const padDuration = (endTime - this.nextNoteTime) + 2;
      playPad(this.ctx, this.dest, this.scale, this.nextNoteTime, padDuration, this.volume);
    }

    this.nextNoteTime = endTime + (0.5 + Math.random() * 1.5); // 间歇 0.5-2s
    const delay = Math.max(100, (this.nextNoteTime - now) * 1000 - 500);

    this.timerRef = window.setTimeout(() => this.scheduleLoop(), delay);
  }

  destroy() {
    this.stop();
  }
}

// ==================== React 组件 ====================

const STORAGE_KEY = 'bg_music_enabled';
const VOLUME_KEY = 'bg_music_volume';

interface BgMusicProps {
  style?: MusicStyle;
  defaultEnabled?: boolean;
}

export default function BackgroundMusic({ style = 'soft', defaultEnabled }: BgMusicProps) {
  const [enabled, setEnabled] = useState(() => {
    if (defaultEnabled !== undefined) return defaultEnabled;
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  });
  const [volume, setVolume] = useState(() => {
    return parseFloat(localStorage.getItem(VOLUME_KEY) || '0.5');
  });
  const [showPanel, setShowPanel] = useState(false);
  const generatorRef = useRef<MusicGenerator | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      generatorRef.current = new MusicGenerator(style);
      initializedRef.current = true;
    }
    const gen = generatorRef.current!;
    gen.setVolume(volume);

    if (enabled) {
      // 需要用户交互后才能播放
      const tryStart = () => {
        gen.start();
        document.removeEventListener('click', tryStart);
        document.removeEventListener('touchstart', tryStart);
      };
      document.addEventListener('click', tryStart, { once: true });
      document.addEventListener('touchstart', tryStart, { once: true });
      // 如果 AudioContext 已经 resumed，直接开始
      if (globalCtx?.state === 'running') {
        gen.start();
      }
    } else {
      gen.stop();
    }

    return () => {
      gen.destroy();
    };
  }, [style]);

  useEffect(() => {
    if (generatorRef.current) {
      generatorRef.current.setVolume(volume);
      localStorage.setItem(VOLUME_KEY, String(volume));
    }
  }, [volume]);

  const toggleMusic = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      if (generatorRef.current) {
        if (next) {
          // 需要 resume AudioContext（浏览器策略要求用户交互）
          if (globalCtx?.state === 'suspended') {
            globalCtx.resume().then(() => generatorRef.current?.start());
          } else {
            generatorRef.current.start();
          }
        } else {
          generatorRef.current.stop();
        }
      }
      return next;
    });
  }, []);

  // 游戏结束时静音
  useEffect(() => {
    return () => {
      if (generatorRef.current) {
        generatorRef.current.stop();
      }
    };
  }, []);

  return (
    <>
      {/* 音乐开关按钮 */}
      <button
        onClick={toggleMusic}
        className="fixed bottom-3 right-3 z-50 w-10 h-10 rounded-full bg-gray-800/80 backdrop-blur-sm border border-gray-600/50 flex items-center justify-center text-lg shadow-lg hover:bg-gray-700/80 transition-all"
        title={enabled ? '关闭音乐' : '开启音乐'}
      >
        {enabled ? '🎵' : '🔇'}
      </button>

      {/* 音量控制面板 */}
      {enabled && (
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="fixed bottom-3 right-16 z-50 w-6 h-6 rounded-full bg-gray-800/80 backdrop-blur-sm border border-gray-600/50 flex items-center justify-center text-xs shadow-lg hover:bg-gray-700/80 transition-all"
        >
          {volume > 0.7 ? '🔊' : volume > 0.3 ? '🔉' : '🔈'}
        </button>
      )}

      {showPanel && enabled && (
        <div className="fixed bottom-14 right-3 z-50 bg-gray-800/95 backdrop-blur-md rounded-xl p-3 shadow-xl border border-gray-600/50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">音量</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="w-24 h-1 accent-purple-500"
            />
            <span className="text-xs text-gray-400 w-8 text-right">{Math.round(volume * 100)}%</span>
          </div>
        </div>
      )}
    </>
  );
}
