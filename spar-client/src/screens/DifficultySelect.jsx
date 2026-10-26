import { useState } from 'react';
import bgImage from '../assets/bg.jpg';

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
      minHeight: '100vh', color: '#f0f0f0', fontFamily: 'Inter, sans-serif',
      backgroundImage: `url(${bgImage})`,
      backgroundSize: 'cover', backgroundPosition: 'center top',
      position: 'relative',
    }}>
      {/* Dark overlay */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,5,8,0.80)',
        zIndex: 0, pointerEvents: 'none',
      }} />

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 56,
        position: 'fixed', top: 0, left: 0, right: 0,
        background: 'transparent', zIndex: 10,
      }}>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>Spar</span>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: 'transparent', color: '#888', border: '1px solid #333',
              padding: '6px 16px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', fontSize: 13,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f0f0f0'; e.currentTarget.style.borderColor = '#555'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#333'; }}
          >
            ← Back
          </button>
        )}
      </nav>

      {/* Content */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh',
        padding: '80px 32px 48px', position: 'relative', zIndex: 1,
      }}>
        <h1 style={{
          fontSize: 'clamp(2.4rem, 5vw, 3.8rem)', fontWeight: 500, lineHeight: 1.05,
          letterSpacing: '-0.04em', margin: '0 0 16px', textAlign: 'center',
        }}>
          Pick your difficulty
        </h1>
        <p style={{ color: '#888', fontSize: 22, marginBottom: 52, textAlign: 'center', maxWidth: 560, lineHeight: 1.6 }}>
          Choose how hard you want to be challenged.
        </p>

        {/* Cards row */}
        <div style={{
          display: 'flex', gap: 16, width: '100%', maxWidth: 1080,
        }}>
          {DIFFICULTIES.map(({ value, label, tagline, description, accentColor }) => {
            const count = countFor(value);
            const isHovered = hovered === value;
            const available = count > 0;
            return (
              <button
                key={value}
                onClick={() => available && onSelect(value)}
                onMouseEnter={() => available && setHovered(value)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  flex: 1,
                  background: isHovered && available
                    ? `${accentColor}14`
                    : 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(40px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                  border: `1px solid ${isHovered && available ? accentColor : 'rgba(255,255,255,0.18)'}`,
                  boxShadow: isHovered && available
                    ? `0 8px 40px ${accentColor}22, inset 0 1px 0 rgba(255,255,255,0.12)`
                    : '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
                  borderRadius: 14,
                  padding: '40px 36px 36px',
                  cursor: available ? 'pointer' : 'not-allowed',
                  opacity: available ? 1 : 0.35,
                  textAlign: 'left',
                  color: '#f0f0f0',
                  fontFamily: 'Inter, sans-serif',
                  transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                {/* Title + badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {label}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                    color: accentColor, background: `${accentColor}20`,
                    padding: '4px 9px', borderRadius: 100, marginTop: 4,
                    whiteSpace: 'nowrap',
                  }}>
                    {count} {count === 1 ? 'SCENARIO' : 'SCENARIOS'}
                  </span>
                </div>

                {/* Tagline */}
                <div style={{
                  fontSize: 11, fontWeight: 700, color: accentColor,
                  letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14,
                }}>
                  {tagline}
                </div>

                {/* Description */}
                <p style={{ fontSize: 15, color: '#bbb', lineHeight: 1.7, margin: '0 0 36px', flex: 1 }}>
                  {description}
                </p>

                {/* Select link */}
                <div style={{
                  fontSize: 14, fontWeight: 600, color: available ? accentColor : '#555',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: isHovered ? 1 : 0.7, transition: 'opacity 0.15s',
                }}>
                  Select {label} <span style={{ fontSize: 16 }}>→</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
