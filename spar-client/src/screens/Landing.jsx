import { useState } from 'react';
import bgImage from '../assets/bg.jpg';

const CODE_SNIPPET = `const orderService = require('./orderService');

// BUG: Missing idempotency check
async function createOrder(req, res) {
  const order = await orderService.create({
    userId: req.user.id,
    items:  req.body.items,
  });
  return res.json({ orderId: order.id });
}`;

const TOKEN_COLORS = {
  keyword: '#ff79c6',
  string: '#f1fa8c',
  comment: '#6272a4',
  fn: '#50fa7b',
  punctuation: '#f8f8f2',
  prop: '#8be9fd',
  default: '#f8f8f2',
};

function CodeLine({ lineNumber, tokens }) {
  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 20 }}>
      <span style={{ color: '#444', minWidth: 16, textAlign: 'right', userSelect: 'none', fontSize: 12 }}>
        {lineNumber}
      </span>
      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
        {tokens.map((t, i) => (
          <span key={i} style={{ color: TOKEN_COLORS[t.type] || TOKEN_COLORS.default }}>{t.text}</span>
        ))}
      </span>
    </div>
  );
}

const CODE_LINES = [
  [{ type: 'keyword', text: 'const ' }, { type: 'prop', text: 'orderService' }, { type: 'default', text: ' = ' }, { type: 'fn', text: 'require' }, { type: 'punctuation', text: '(' }, { type: 'string', text: "'./orderService'" }, { type: 'punctuation', text: ');' }],
  [],
  [{ type: 'comment', text: '// BUG: Missing idempotency check' }],
  [{ type: 'keyword', text: 'async ' }, { type: 'keyword', text: 'function ' }, { type: 'fn', text: 'createOrder' }, { type: 'punctuation', text: '(req, res) {' }],
  [{ type: 'keyword', text: '  const ' }, { type: 'prop', text: 'order' }, { type: 'default', text: ' = ' }, { type: 'keyword', text: 'await ' }, { type: 'prop', text: 'orderService' }, { type: 'punctuation', text: '.' }, { type: 'fn', text: 'create' }, { type: 'punctuation', text: '({' }],
  [{ type: 'prop', text: '    userId' }, { type: 'punctuation', text: ': ' }, { type: 'prop', text: 'req' }, { type: 'punctuation', text: '.' }, { type: 'prop', text: 'user' }, { type: 'punctuation', text: '.' }, { type: 'prop', text: 'id' }, { type: 'punctuation', text: ',' }],
  [{ type: 'prop', text: '    items' }, { type: 'punctuation', text: ':  ' }, { type: 'prop', text: 'req' }, { type: 'punctuation', text: '.' }, { type: 'prop', text: 'body' }, { type: 'punctuation', text: '.' }, { type: 'prop', text: 'items' }, { type: 'punctuation', text: ',' }],
  [{ type: 'punctuation', text: '  });' }],
  [{ type: 'keyword', text: '  return ' }, { type: 'prop', text: 'res' }, { type: 'punctuation', text: '.' }, { type: 'fn', text: 'json' }, { type: 'punctuation', text: '({ ' }, { type: 'prop', text: 'orderId' }, { type: 'punctuation', text: ': ' }, { type: 'prop', text: 'order' }, { type: 'punctuation', text: '.' }, { type: 'prop', text: 'id' }, { type: 'punctuation', text: ' });' }],
  [{ type: 'punctuation', text: '}' }],
];

export default function Landing({ scenarios, onStart }) {
  const [selected, setSelected] = useState(scenarios[0]);

  return (
    <div style={{
      minHeight: '100vh', color: '#f0f0f0', fontFamily: 'sans-serif',
      backgroundImage: `url(${bgImage})`,
      backgroundSize: 'cover', backgroundPosition: 'center top',
      position: 'relative',
    }}>
      {/* Dark overlay so text stays readable */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,5,8,0.78)',
        zIndex: 0, pointerEvents: 'none',
      }} />

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 56,
        position: 'sticky', top: 0, background: 'transparent', zIndex: 10,
      }}>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>Spar</span>
        <div style={{ display: 'flex', gap: 32 }}>
          {['Examples', 'How it works', 'Docs'].map(l => (
            <a key={l} href="#" style={{ color: '#ccc', fontSize: 14, textDecoration: 'none' }}
              onMouseEnter={e => e.target.style.color = '#fff'}
              onMouseLeave={e => e.target.style.color = '#ccc'}>
              {l}
            </a>
          ))}
        </div>
        <a href="#" style={{ color: '#ccc', fontSize: 14, textDecoration: 'none' }}
          onMouseEnter={e => e.target.style.color = '#f0f0f0'}
          onMouseLeave={e => e.target.style.color = '#555'}>
          Sign in
        </a>
      </nav>

      {/* Hero */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px 24px 0', position: 'relative', zIndex: 1 }}>
        <h1 style={{
          fontSize: 'clamp(2.8rem, 7vw, 5rem)', fontWeight: 800, lineHeight: 1.05,
          letterSpacing: '-0.03em', maxWidth: 900, margin: '0 0 16px',
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
            fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.01em',
          }}>
            Start practicing <span style={{ fontSize: 16 }}>→</span>
          </button>
          <button style={{
            background: 'transparent', color: '#f0f0f0',
            border: '1px solid #333', padding: '13px 28px', borderRadius: 8,
            fontSize: 15, cursor: 'pointer', fontFamily: 'sans-serif',
          }}>
            View examples
          </button>
        </div>

        {/* Feature checkmarks */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 40 }}>
          {['Real scenarios', 'AI feedback', 'Detailed reports'].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555' }}>
              <span style={{ color: '#3ddc84', fontWeight: 700 }}>✓</span> {f}
            </div>
          ))}
        </div>

        {/* Code demo panel */}
        <div style={{
          width: '100%', maxWidth: 860, borderRadius: 12,
          border: '1px solid #222', background: '#111', overflow: 'hidden',
          marginBottom: 40, boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
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

          {/* Code content */}
          <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {CODE_LINES.map((tokens, i) => (
                <CodeLine key={i} lineNumber={i + 1} tokens={tokens} />
              ))}
            </div>

            {/* Score badge */}
            <div style={{
              position: 'absolute', top: 16, right: 16,
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              borderRadius: 8, padding: '6px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f5a623', lineHeight: 1 }}>73</div>
              <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>/100</div>
            </div>
          </div>

          {/* AI status bar */}
          <div style={{
            padding: '10px 20px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#ff5c35' }} />
            <span style={{ fontSize: 12, color: '#555', fontStyle: 'italic' }}>
              AI interviewer is analyzing your code...
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1, width: '100%', maxWidth: 860,
          border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden', marginBottom: 48,
        }}>
          {[
            { value: '5+', label: 'Debugging scenarios' },
            { value: 'Real-time', label: 'AI feedback' },
            { value: '100%', label: 'Mock practice' },
            { value: 'No signup', label: 'Start immediately' },
          ].map((stat, i) => (
            <div key={i} style={{
              background: '#111', padding: '24px 20px', textAlign: 'center',
              borderRight: i < 3 ? '1px solid #1a1a1a' : 'none',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#f0f0f0', marginBottom: 4 }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: '#555' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
