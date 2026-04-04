import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import bgImage from '../assets/bg.jpg';

const DEMO_SEGMENTS = [
  {
    code: `const orderService = require('./orderService');

// BUG: Missing idempotency check
async function createOrder(req, res) {
  const order = await orderService.create({
    userId: req.user.id,
    items:  req.body.items,
  });
  return res.json({ orderId: order.id });
}`,
    popup: "What's happening inside that catch block?",
    response: "The catch block is creating a second order. That's the duplicate.",
  },
  {
    code: `


// Adding idempotency key validation
  const key = req.headers['x-idempotency-key'];
  if (!key) {
    return res.status(400).json({ error: 'Idempotency key required' });
  }`,
    popup: "Walk me through why you'd add that check.",
    response: "Without it, the same request retried twice would create two orders.",
  },
  {
    code: `

  const existing = await orderService.findByKey(key);
  if (existing) {
    return res.json({ orderId: existing.id, duplicate: true });
  }`,
    popup: "What if two requests arrive at the exact same time?",
    response: "We'd need a lock or transaction to handle that race condition.",
  },
  {
    code: `

  await db.transaction(async (trx) => {
    const order = await orderService.create({
      userId: req.user.id,
      items: req.body.items,
      idempotencyKey: key,
    }, trx);
    return res.json({ orderId: order.id });
  });
}`,
    popup: "How would you test this under concurrent load?",
    response: "Send parallel requests with the same key, assert only one order is created.",
  },
];

const liquidGlass = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(40px) saturate(180%)',
  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.18)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
  borderRadius: 12,
  padding: '12px 14px',
};

export default function Landing({ scenarios, onStart }) {
  const [selected] = useState(scenarios[0]);
  const [editorCode, setEditorCode] = useState('');
  const [popup, setPopup] = useState({ visible: false, message: '', fading: false });
  const [response, setResponse] = useState({ visible: false, message: '', fading: false });

  const typingRef = useRef(null);
  const segmentRef = useRef(0);
  const charRef = useRef(0);
  const pausedRef = useRef(false);
  const accumRef = useRef('');
  const editorRef = useRef(null);

  useEffect(() => {
    typingRef.current = setInterval(() => {
      if (pausedRef.current) return;

      const segIdx = segmentRef.current;
      const seg = DEMO_SEGMENTS[segIdx];
      if (!seg) return;

      charRef.current++;
      const code = accumRef.current + seg.code.slice(0, charRef.current);
      setEditorCode(code);

      // Auto-scroll to bottom
      if (editorRef.current) {
        const lineCount = editorRef.current.getModel()?.getLineCount() ?? 1;
        editorRef.current.revealLine(lineCount);
      }

      if (charRef.current >= seg.code.length) {
        pausedRef.current = true;
        accumRef.current += seg.code;

        setTimeout(() => {
          // AI interviewer card
          setPopup({ visible: true, message: seg.popup, fading: false });

          // Interviewee response card after 2s
          setTimeout(() => {
            setResponse({ visible: true, message: seg.response, fading: false });
          }, 2000);

          // Fade both out at 4s
          setTimeout(() => {
            setPopup(p => ({ ...p, fading: true }));
            setResponse(p => ({ ...p, fading: true }));
          }, 4000);

          // Hide both, advance segment
          setTimeout(() => {
            setPopup({ visible: false, message: '', fading: false });
            setResponse({ visible: false, message: '', fading: false });

            const next = segmentRef.current + 1;
            if (next >= DEMO_SEGMENTS.length) {
              segmentRef.current = 0;
              charRef.current = 0;
              accumRef.current = '';
              setEditorCode('');
            } else {
              segmentRef.current = next;
              charRef.current = 0;
            }
            pausedRef.current = false;
          }, 4700);
        }, 600);
      }
    }, 18);

    return () => clearInterval(typingRef.current);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', color: '#f0f0f0', fontFamily: 'Inter, sans-serif',
      backgroundImage: `url(${bgImage})`,
      backgroundSize: 'cover', backgroundPosition: 'center top',
      position: 'relative',
    }}>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,5,8,0.78)',
        zIndex: 0, pointerEvents: 'none',
      }} />

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 56,
        position: 'fixed', top: 0, left: 0, right: 0, background: 'transparent', zIndex: 10,
      }}>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>Spar</span>
        <div />
        <a href="#" style={{ color: '#ccc', fontSize: 14, textDecoration: 'none' }}
          onMouseEnter={e => e.target.style.color = '#f0f0f0'}
          onMouseLeave={e => e.target.style.color = '#ccc'}>
          Sign in
        </a>
      </nav>

      {/* Hero */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '104px 24px 0', position: 'relative', zIndex: 1 }}>
        <h1 style={{
          fontSize: 'clamp(2.4rem, 5.5vw, 4rem)', fontWeight: 500, lineHeight: 1.05,
          letterSpacing: '-0.04em', maxWidth: 900, margin: '0 0 16px',
        }}>
          Practice debugging like a real interview
        </h1>

        <p style={{ color: '#aaa', fontSize: 18, maxWidth: 620, lineHeight: 1.7, margin: '0 0 28px' }}>
          Debug real production codebases, think out loud, and get grilled by an AI interviewer. Just like the real thing.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button onClick={() => onStart(selected)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#ff5c35', color: '#fff', border: 'none',
            padding: '13px 28px', borderRadius: 8,
            fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.005em',
          }}>
            Start practicing <span style={{ fontSize: 16 }}>→</span>
          </button>
          <button style={{
            ...liquidGlass,
            color: '#f0f0f0',
            padding: '13px 28px',
            fontSize: 15, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            View examples
          </button>
        </div>

        {/* Code demo panel */}
        <div style={{
          width: '100%', maxWidth: 1200, borderRadius: 12,
          border: '1px solid #222', background: '#111', overflow: 'hidden',
          marginBottom: 40, boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          position: 'relative',
        }}>
          {/* Panel top bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', background: '#161616', borderBottom: '1px solid #222',
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
              <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e' }} />
              <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
            </div>
            <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace' }}>orders.js</span>
          </div>

          {/* Monaco editor */}
          <div style={{ height: 560 }}>
            <Editor
              height="100%"
              language="javascript"
              theme="vs-dark"
              value={editorCode}
              onMount={editor => { editorRef.current = editor; }}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                padding: { top: 12 },
                scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                overviewRulerLanes: 0,
                readOnly: true,
                domReadOnly: true,
                cursorBlinking: 'smooth',
              }}
            />
          </div>

          {/* AI interviewer popup — bottom right */}
          {popup.visible && (
            <div style={{
              position: 'absolute', bottom: 56, right: 20,
              maxWidth: 260, zIndex: 10,
              opacity: popup.fading ? 0 : 1,
              transform: popup.fading ? 'translateY(4px)' : 'translateY(0)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}>
              <div style={liquidGlass}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff5c35', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#ff5c35', letterSpacing: '0.1em' }}>AI INTERVIEWER</span>
                </div>
                <p style={{ fontSize: 13, color: '#f0f0f0', lineHeight: 1.55, margin: 0 }}>
                  {popup.message}
                </p>
              </div>
            </div>
          )}

          {/* Interviewee response popup — bottom left */}
          {response.visible && (
            <div style={{
              position: 'absolute', bottom: 56, left: 20,
              maxWidth: 260, zIndex: 10,
              opacity: response.fading ? 0 : 1,
              transform: response.fading ? 'translateY(4px)' : 'translateY(0)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}>
              <div style={liquidGlass}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3ddc84', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#3ddc84', letterSpacing: '0.1em' }}>CANDIDATE</span>
                </div>
                <p style={{ fontSize: 13, color: '#f0f0f0', lineHeight: 1.55, margin: 0 }}>
                  {response.message}
                </p>
              </div>
            </div>
          )}

          {/* AI status bar */}
          <div style={{ padding: '10px 20px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#ff5c35' }} />
            <span style={{ fontSize: 12, color: '#555', fontStyle: 'italic' }}>
              AI interviewer is analyzing your code...
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
