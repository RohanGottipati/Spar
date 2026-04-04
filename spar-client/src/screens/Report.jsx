function formatDuration(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}m ${secs}s`;
}

function formatTimeToFirstEdit(seconds) {
  if (!Number.isFinite(seconds)) {
    return 'No edit recorded';
  }

  return `${seconds}s to first edit`;
}

function getVerdictColor(verdict) {
  if (verdict === 'Strong Hire') {
    return '#3ddc84';
  }

  if (verdict === 'Hire' || verdict === 'Leaning Hire') {
    return '#5b9cf6';
  }

  return '#ff8c6b';
}

export default function Report({ report, scenario, onRetry }) {
  const dimensions = Array.isArray(report?.dimensions) ? report.dimensions : [];
  const meta = report?.sessionMeta || {};
  const verdictColor = getVerdictColor(report?.verdict);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0b',
      color: '#f0f0f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif',
      padding: 40,
    }}>
      <div style={{ maxWidth: 760, width: '100%' }}>
        <div style={{ fontSize: 12, color: '#ff5c35', fontWeight: 700, letterSpacing: '0.2em', marginBottom: 8 }}>
          SPAR — SESSION COMPLETE
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Your Report</h1>
        <p style={{ color: '#555', marginBottom: 28 }}>
          {scenario.title} · {formatDuration(meta.durationSeconds)}
        </p>

        <div style={{
          background: '#111',
          border: '1px solid #222',
          borderRadius: 14,
          padding: 24,
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                Final Verdict
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: verdictColor }}>
                {report?.verdict || 'Pending'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <MetaPill label={`${meta.filesOpened || 0} files opened`} />
              <MetaPill label={`${meta.utteranceCount || 0} utterances`} />
              <MetaPill label={formatTimeToFirstEdit(meta.timeToFirstEditSeconds)} />
            </div>
          </div>

          <p style={{ color: '#ccc', lineHeight: 1.7, margin: 0 }}>
            {report?.verdictSummary}
          </p>
        </div>

        <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
          {dimensions.map((dimension) => (
            <ScoreRow
              key={dimension.key}
              label={dimension.label}
              score={dimension.score}
              maxScore={dimension.maxScore}
              summary={dimension.summary}
            />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 32 }}>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 12, color: '#555', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 12 }}>
              WHAT TO WORK ON NEXT
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {(report?.nextSteps || []).map((step) => (
                <div key={step} style={{ color: '#ccc', lineHeight: 1.6 }}>
                  - {step}
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 12, color: '#555', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 12 }}>
              THE BUG
            </div>
            <p style={{ color: '#ccc', lineHeight: 1.6, marginTop: 0 }}>{scenario.bugExplanation}</p>
            <div style={{ marginTop: 16, fontSize: 13, color: '#ff5c35' }}>Fix: {scenario.fixSummary}</div>
          </div>
        </div>

        <button onClick={onRetry} style={{
          background: 'transparent',
          color: '#555',
          border: '1px solid #333',
          padding: '12px 28px',
          borderRadius: 8,
          cursor: 'pointer',
          fontFamily: 'sans-serif',
          fontSize: 14,
        }}>
          ← Try again
        </button>
      </div>
    </div>
  );
}

function MetaPill({ label }) {
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: 999,
      border: '1px solid #2a2a2a',
      color: '#888',
      fontSize: 12,
      background: '#0d0d0e',
    }}>
      {label}
    </div>
  );
}

function ScoreRow({ label, score = 0, maxScore = 10, summary }) {
  const pct = Math.round((score / maxScore) * 100);
  const color = pct >= 80 ? '#3ddc84' : pct >= 60 ? '#5b9cf6' : pct >= 40 ? '#f5a623' : '#ff8c6b';

  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>
          {score}/{maxScore}
        </span>
      </div>
      <div style={{ background: '#1e1e1e', borderRadius: 4, height: 6, marginBottom: 12 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <p style={{ fontSize: 13, color: '#999', margin: 0, lineHeight: 1.6 }}>{summary}</p>
    </div>
  );
}
