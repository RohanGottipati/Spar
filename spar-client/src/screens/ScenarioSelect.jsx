import { useState } from 'react';
import bgImage from '../assets/bg.jpg';

const DIFFICULTY_LABELS = {
  easy:   { label: 'Easy',   color: '#3ddc84' },
  medium: { label: 'Medium', color: '#f5a623' },
  hard:   { label: 'Hard',   color: '#ff5c35' },
};

export default function ScenarioSelect({ scenarios, difficulty, notice = '', onSelect, onBack }) {
  const [hovered, setHovered] = useState(null);
  const { label, color } = DIFFICULTY_LABELS[difficulty] ?? { label: difficulty, color: '#ff5c35' };

  return (
    <div style={{
      minHeight: '100vh', color: '#f0f0f0', fontFamily: 'Inter, sans-serif',
      backgroundImage: `url(${bgImage})`,
      backgroundSize: 'cover', backgroundPosition: 'center top',
      position: 'relative',
    }}>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,8,0.82)', zIndex: 0, pointerEvents: 'none' }} />

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 56,
        position: 'fixed', top: 0, left: 0, right: 0,
        background: 'transparent', zIndex: 10,
      }}>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>Spar</span>
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
      </nav>

      {/* Content */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        minHeight: '100vh', padding: '96px 40px 60px',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 500, lineHeight: 1.1,
            letterSpacing: '-0.04em', margin: 0,
          }}>
            Choose a scenario
          </h1>
          <span style={{
            fontSize: 12, fontWeight: 600, color,
            background: `${color}18`, padding: '4px 10px',
            borderRadius: 100, letterSpacing: '0.08em', whiteSpace: 'nowrap',
          }}>
            {label}
          </span>
        </div>

        <p style={{ color: '#bbb', fontSize: 16, marginBottom: 40, textAlign: 'center', whiteSpace: 'nowrap' }}>
          Each scenario is a real-world production bug. Pick one to investigate.
        </p>

        {notice && (
          <div style={{
            maxWidth: 1000, width: '100%', marginBottom: 24,
            padding: '14px 16px', borderRadius: 12,
            background: '#2a1611', border: '1px solid #5a2d1f',
            color: '#ffb39d', fontSize: 14, lineHeight: 1.5,
          }}>
            {notice}
          </div>
        )}

        {scenarios.length === 0 && (
          <p style={{ color: '#555', textAlign: 'center', fontSize: 15 }}>
            No scenarios available for this difficulty yet.
          </p>
        )}

        {/* 2-column grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 16, width: '100%', maxWidth: 1000,
        }}>
          {scenarios.map((scenario, i) => {
            const isHovered = hovered === scenario.id;
            const isLastOdd = scenarios.length % 2 !== 0 && i === scenarios.length - 1;
            return (
              <button
                key={scenario.id}
                onClick={() => onSelect(scenario)}
                onMouseEnter={() => setHovered(scenario.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  gridColumn: isLastOdd ? '1 / -1' : 'auto',
                  background: isHovered ? `${color}12` : 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(40px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                  border: `1px solid ${isHovered ? color : 'rgba(255,255,255,0.12)'}`,
                  boxShadow: isHovered
                    ? `0 8px 40px ${color}20, inset 0 1px 0 rgba(255,255,255,0.1)`
                    : '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
                  borderRadius: 14, padding: '28px 28px 26px',
                  cursor: 'pointer', textAlign: 'left',
                  color: '#f0f0f0', fontFamily: 'Inter, sans-serif',
                  transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    {scenario.title}
                  </span>
                  <span style={{ fontSize: 12, color: '#777', whiteSpace: 'nowrap', marginLeft: 16, paddingTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {Math.round(scenario.timeLimit / 60)} min
                  </span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
                  {scenario.company}
                </div>
                <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.7, margin: 0 }}>
                  {scenario.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
