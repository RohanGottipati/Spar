import { useState } from 'react';

const DIFFICULTIES = [
  {
    value: 'easy',
    label: 'Easy',
    tagline: 'Spot the obvious miss',
    description: 'A single missing guard or off-by-one that causes an immediate crash or wrong result. Good for a first run or a quick warm-up.',
    accentColor: '#3ddc84',
  },
  {
    value: 'medium',
    label: 'Medium',
    tagline: 'Trace the full request path',
    description: 'A logic error that only surfaces under specific conditions. Requires reading multiple files and understanding how they connect.',
    accentColor: '#f5a623',
  },
  {
    value: 'hard',
    label: 'Hard',
    tagline: 'Think in systems',
    description: 'A concurrency or architectural flaw requiring an understanding of distributed behaviour, locking, or subtle timing. Senior-level territory.',
    accentColor: '#ff5c35',
  },
];

export default function DifficultySelect({ scenarios, onSelect, onBack }) {
  const [hovered, setHovered] = useState(null);

  const countFor = (value) => scenarios.filter(s => s.difficulty === value).length;

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0b', color: '#f0f0f0',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'sans-serif', padding: 40,
    }}>
      <div style={{ fontSize: 11, color: '#ff5c35', fontWeight: 700, letterSpacing: '0.25em', marginBottom: 40 }}>
        ▲ SPAR
      </div>

      <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, textAlign: 'center', letterSpacing: '-0.02em' }}>
        Pick your difficulty
      </h2>
      <p style={{ color: '#555', fontSize: 15, marginBottom: 48, textAlign: 'center' }}>
        This sets the complexity of the bug you'll be asked to find and fix.
      </p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 860, width: '100%' }}>
        {DIFFICULTIES.map(({ value, label, tagline, description, accentColor }) => {
          const count = countFor(value);
          const isHovered = hovered === value;
          return (
            <button
              key={value}
              onClick={() => count > 0 && onSelect(value)}
              onMouseEnter={() => count > 0 && setHovered(value)}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex: '1 1 240px',
                maxWidth: 280,
                background: isHovered && count > 0 ? '#111' : 'transparent',
                border: `1px solid ${isHovered && count > 0 ? accentColor : '#222'}`,
                borderRadius: 12,
                padding: '28px 24px',
                cursor: count > 0 ? 'pointer' : 'not-allowed',
                opacity: count > 0 ? 1 : 0.4,
                textAlign: 'left',
                color: '#f0f0f0',
                fontFamily: 'sans-serif',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: isHovered ? accentColor : '#f0f0f0' }}>
                  {label}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                  color: accentColor, background: `${accentColor}1a`,
                  padding: '3px 8px', borderRadius: 100,
                }}>
                  {count} {count === 1 ? 'scenario' : 'scenarios'}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: accentColor, marginBottom: 8 }}>
                {tagline}
              </div>
              <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, margin: 0 }}>
                {description}
              </p>
            </button>
          );
        })}
      </div>

      {onBack && (
        <button
          onClick={onBack}
          style={{
            marginTop: 40, background: 'transparent', color: '#555',
            border: '1px solid #333', padding: '10px 24px', borderRadius: 8,
            cursor: 'pointer', fontFamily: 'sans-serif', fontSize: 14,
          }}
        >
          ← Back
        </button>
      )}
    </div>
  );
}
