export default function Landing({ onStart }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0b', color: '#f0f0f0',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'sans-serif', padding: 40, textAlign: 'center'
    }}>
      <div style={{ fontSize: 11, color: '#ff5c35', fontWeight: 700, letterSpacing: '0.25em', marginBottom: 32 }}>
        ▲ SPAR
      </div>

      <h1 style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.05, marginBottom: 16, letterSpacing: '-0.02em' }}>
        The interview changed.<br />
        <span style={{ color: '#ff5c35' }}>The prep didn't.</span>
      </h1>

      <p style={{ color: '#555', fontSize: 17, maxWidth: 480, lineHeight: 1.6, marginBottom: 48 }}>
        Real codebases. Real bugs. An AI interviewer that pushes back. This is how hiring works in 2026.
      </p>

      <div style={{ display: 'flex', marginBottom: 48, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>
        {['1970 — Whiteboard', '2015 — LeetCode', '2026 — Spar'].map((item, i) => (
          <div key={item} style={{
            padding: '10px 18px', border: '0.5px solid',
            borderColor: i === 2 ? '#ff5c35' : '#222',
            background: i === 2 ? '#ff5c35' : 'transparent',
            color: i === 2 ? '#fff' : i === 1 ? '#555' : '#333',
            borderRadius: i === 0 ? '6px 0 0 6px' : i === 2 ? '0 6px 6px 0' : 0,
          }}>
            {item}
          </div>
        ))}
      </div>

      <button onClick={onStart} style={{
        background: '#ff5c35', color: '#fff', border: 'none',
        padding: '16px 52px', borderRadius: 10,
        fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em',
      }}>
        Start Interview →
      </button>

      <p style={{ marginTop: 20, fontSize: 13, color: '#333' }}>
        Microphone required · Choose your difficulty
      </p>
    </div>
  );
}
