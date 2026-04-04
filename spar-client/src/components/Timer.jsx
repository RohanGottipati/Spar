import { useState, useEffect } from 'react';

export default function Timer({ seconds, onExpire }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) { onExpire(); return; }
    const interval = setInterval(() => setRemaining(r => r - 1), 1000);
    return () => clearInterval(interval);
  }, [remaining, onExpire]);

  const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
  const secs = (remaining % 60).toString().padStart(2, '0');
  const isUrgent = remaining < 5 * 60;

  return (
    <div style={{
      fontFamily: 'monospace', fontSize: 18, fontWeight: 600,
      color: isUrgent ? '#ff5c35' : '#f5a623',
      background: isUrgent ? 'rgba(255,92,53,0.1)' : 'rgba(245,166,35,0.1)',
      padding: '6px 14px', borderRadius: 6,
    }}>
      {mins}:{secs}
    </div>
  );
}
