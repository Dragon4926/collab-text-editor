import { useEffect, useRef, useState } from 'react';
import { mergeAttributes, Node, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { Mic, Pause, Play, Square, Trash2 } from 'lucide-react';
import { getBlob, putBlob } from '@/lib/blobs';

/**
 * Voice memos — Samsung Notes' "voice recording" attached to a note.
 *
 * Recording pipeline:
 *
 *   microphone ─▶ MediaStream ─┬─▶ MediaRecorder ─▶ Blob (webm/opus) ─▶ IndexedDB
 *                              └─▶ AnalyserNode  ─▶ loudness samples ─▶ waveform
 *
 * The AnalyserNode (Web Audio API) exposes the live signal; every 60 ms we
 * take the RMS ("root mean square" ≈ perceived loudness) of the samples and
 * push it onto the `peaks` array. Those peaks are saved in the node so the
 * waveform renders instantly without decoding the audio again.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    voiceMemo: {
      insertVoiceMemo: () => ReturnType;
    };
  }
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const BARS = 64;

/** squeeze/stretch a list of peaks to exactly n bars */
function resample(peaks: number[], n: number) {
  if (!peaks.length) return new Array(n).fill(0.04);
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i / n) * peaks.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
    return Math.max(...peaks.slice(a, b));
  });
}

function VoiceView({ node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const { blobId, duration, peaks } = node.attrs as { blobId: string | null; duration: number; peaks: number[] };
  const [state, setState] = useState<'idle' | 'recording' | 'error'>('idle');
  const [live, setLive] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(1);
  const audio = useRef<HTMLAudioElement>(null);
  const rec = useRef<{ stop: () => void } | null>(null);

  // load the stored blob into an object URL for <audio>
  useEffect(() => {
    if (!blobId) return;
    let objectUrl: string | null = null;
    getBlob(blobId).then((b) => {
      if (b) setUrl((objectUrl = URL.createObjectURL(b)));
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobId]);

  // stop the microphone if the block is deleted mid-recording
  useEffect(() => () => rec.current?.stop(), []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const samples: number[] = [];
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      const t0 = performance.now();

      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length);
        samples.push(Math.min(1, rms * 4)); // boost: speech RMS is usually < 0.25
        setLive(samples.slice(-BARS));
        setElapsed((performance.now() - t0) / 1000);
      }, 60);

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const id = await putBlob(blob);
        updateAttributes({ blobId: id, duration: (performance.now() - t0) / 1000, peaks: resample(samples, 96).map((p) => Math.round(p * 100) / 100) });
        setState('idle');
      };
      recorder.start();
      rec.current = { stop: () => recorder.state !== 'inactive' && recorder.stop() };
      setState('recording');
    } catch {
      setState('error');
    }
  };

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  const bars = resample(state === 'recording' ? live : peaks, BARS);

  return (
    <NodeViewWrapper className={`voice-memo is-${state}`} contentEditable={false}>
      {!blobId && state !== 'recording' ? (
        <button type="button" className="voice-memo__record" onClick={start}>
          <span className="voice-memo__dot">
            <Mic width={16} height={16} />
          </span>
          {state === 'error' ? 'Microphone unavailable — try again' : 'Record a voice memo'}
        </button>
      ) : (
        <>
          {state === 'recording' ? (
            <button type="button" className="voice-memo__btn is-stop" aria-label="Stop recording" onClick={() => rec.current?.stop()}>
              <Square width={14} height={14} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className="voice-memo__btn" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} disabled={!url}>
              {playing ? <Pause width={16} height={16} fill="currentColor" /> : <Play width={16} height={16} fill="currentColor" />}
            </button>
          )}

          <div
            className="voice-memo__wave"
            role={state === 'recording' ? undefined : 'slider'}
            aria-label="Seek"
            aria-valuenow={Math.round(progress * 100)}
            onPointerDown={(e) => {
              const a = audio.current;
              if (!a || state === 'recording' || !a.duration) return;
              const r = e.currentTarget.getBoundingClientRect();
              a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
            }}
          >
            {bars.map((p, i) => (
              <span key={i} className={i / BARS < progress ? 'is-played' : ''} style={{ height: `${Math.max(8, p * 100)}%` }} />
            ))}
          </div>

          <span className="voice-memo__time">{state === 'recording' ? fmt(elapsed) : fmt(progress * duration || duration)}</span>
          {state !== 'recording' && (
            <>
              <button
                type="button"
                className="voice-memo__rate"
                title="Playback speed"
                onClick={() => {
                  const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
                  setRate(next);
                  if (audio.current) audio.current.playbackRate = next;
                }}
              >
                {rate}×
              </button>
              <button type="button" className="voice-memo__delete" aria-label="Delete voice memo" onClick={deleteNode}>
                <Trash2 width={14} height={14} />
              </button>
            </>
          )}
          {url && (
            <audio
              ref={audio}
              src={url}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setProgress(0);
              }}
              onTimeUpdate={(e) => {
                const a = e.currentTarget;
                setProgress(a.duration && isFinite(a.duration) ? a.currentTime / a.duration : a.currentTime / Math.max(duration, 0.1));
              }}
            />
          )}
        </>
      )}
    </NodeViewWrapper>
  );
}

export const VoiceMemo = Node.create({
  name: 'voiceMemo',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blobId: { default: null },
      duration: { default: 0 },
      peaks: { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-voice-memo]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-voice-memo': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VoiceView, { stopEvent: () => true });
  },

  addCommands() {
    return {
      insertVoiceMemo:
        () =>
        ({ commands }) =>
          commands.insertContent([{ type: this.name }, { type: 'paragraph' }]),
    };
  },
});
