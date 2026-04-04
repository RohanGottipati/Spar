export default function Report({ report, scenario, onRetry }) {
  const scores = generateScores(report);

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0b', color: '#f0f0f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'sans-serif', padding: 40,
    }}>
      <div style={{ maxWidth: 640, width: '100%' }}>
        <div style={{ fontSize: 12, color: '#ff5c35', fontWeight: 700, letterSpacing: '0.2em', marginBottom: 8 }}>
          SPAR — SESSION COMPLETE
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Your Report</h1>
        <p style={{ color: '#555', marginBottom: 40 }}>
          {scenario.title} · {Math.floor(report.duration / 60)}m {report.duration % 60}s
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
          {scores.map(score => <ScoreRow key={score.label} {...score} />)}
        </div>

        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24, marginBottom: 32 }}>
          <div style={{ fontSize: 12, color: '#555', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 12 }}>
            THE BUG
          </div>
          <p style={{ color: '#ccc', lineHeight: 1.6 }}>{scenario.bugExplanation}</p>
          <div style={{ marginTop: 16, fontSize: 13, color: '#ff5c35' }}>Fix: {scenario.fixSummary}</div>
        </div>

        <button onClick={onRetry} style={{
          background: 'transparent', color: '#555', border: '1px solid #333',
          padding: '12px 28px', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'sans-serif', fontSize: 14,
        }}>
          ← Try again
        </button>
      </div>
    </div>
  );
}

function ScoreRow({ label, score, max, description, color }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ background: '#1e1e1e', borderRadius: 4, height: 6, marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <p style={{ fontSize: 13, color: '#666', margin: 0 }}>{description}</p>
    </div>
  );
}

function generateScores(report) {
  const readPct = report.timeToFirstEdit ? Math.min(report.timeToFirstEdit / 120, 1) : 0;
  const readScore = report.readBeforeEdit ? 5 : 2;

  return [
    {
      label: 'Code reading', score: Math.round(readPct * 5 + readScore), max: 10, color: '#3ddc84',
      description: report.readBeforeEdit
        ? `You spent time reading before editing — good signal. First edit at ${report.timeToFirstEdit}s.`
        : 'You jumped to editing quickly. Interviewers want to see you understand the codebase first.'
    },
    {
      label: 'Communication', score: Math.min(report.utteranceCount, 10), max: 10, color: '#5b9cf6',
      description: `You made ${report.utteranceCount} verbal statements. Strong candidates narrate every thought — including dead ends.`
    },
    {
      label: 'Exploration', score: Math.min(report.filesViewed, 4), max: 4, color: '#f5a623',
      description: `You opened ${report.filesViewed} file${report.filesViewed !== 1 ? 's' : ''}. Good debugging means tracing the full request path before assuming you know where the bug is.`
    },
    {
      label: 'Engagement', score: Math.min(report.aiMessagesReceived, 10), max: 10, color: '#ff5c35',
      description: `You responded to ${report.aiMessagesReceived} interviewer questions. The best candidates treat the interviewer as a collaborator, not an obstacle.`
    }
  ];
}
