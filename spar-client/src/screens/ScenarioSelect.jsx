const DIFFICULTY_LABELS = {
  easy:   { label: 'Easy',   color: '#3ddc84' },
  medium: { label: 'Medium', color: '#f5a623' },
  hard:   { label: 'Hard',   color: '#ff5c35' },
};

export default function ScenarioSelect({ scenarios, difficulty, notice = '', onSelect, onBack }) {
  const { label, color } = DIFFICULTY_LABELS[difficulty] ?? { label: difficulty, color: '#ff5c35' };

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0b', color: '#f0f0f0',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'sans-serif', padding: 40,
    }}>
      <div style={{ fontSize: 11, color: '#ff5c35', fontWeight: 700, letterSpacing: '0.25em', marginBottom: 40 }}>
        ▲ SPAR
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Choose a scenario
        </h2>
        <span style={{
          fontSize: 12, fontWeight: 700, color,
          background: `${color}1a`, padding: '4px 10px',
          borderRadius: 100, letterSpacing: '0.08em',
        }}>
          {label}
        </span>
      </div>

      <p style={{ color: '#555', fontSize: 15, marginBottom: 48, textAlign: 'center' }}>
        Each scenario is a real-world production bug. Pick one to investigate.
      </p>

      {notice && (
        <div style={{
          maxWidth: 600,
          width: '100%',
          marginBottom: 24,
          padding: '14px 16px',
          borderRadius: 12,
          background: '#2a1611',
          border: '1px solid #5a2d1f',
          color: '#ffb39d',
          fontSize: 14,
          lineHeight: 1.5,
        }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600, width: '100%' }}>
        {scenarios.length === 0 && (
          <p style={{ color: '#555', textAlign: 'center', fontSize: 15 }}>
            No scenarios available for this difficulty yet.
          </p>
        )}
        {scenarios.map(scenario => (
          <button
            key={scenario.id}
            onClick={() => onSelect(scenario)}
            onMouseEnter={e => e.currentTarget.style.borderColor = color}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#222'}
            style={{
              background: '#111', border: '1px solid #222', borderRadius: 12,
              padding: '24px', cursor: 'pointer', textAlign: 'left',
              color: '#f0f0f0', fontFamily: 'sans-serif', width: '100%',
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{scenario.title}</span>
              <span style={{ fontSize: 12, color: '#555', whiteSpace: 'nowrap', marginLeft: 16 }}>
                {Math.round(scenario.timeLimit / 60)} min
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 8, letterSpacing: '0.05em' }}>
              {scenario.company}
            </div>
            <p style={{ fontSize: 14, color: '#888', lineHeight: 1.6, margin: 0 }}>
              {scenario.description}
            </p>
          </button>
        ))}
      </div>

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
    </div>
  );
}
