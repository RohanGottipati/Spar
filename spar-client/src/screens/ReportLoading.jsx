import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../lib/api';

export default function ReportLoading({ payload, scenario, onComplete, onBack }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const generateReport = useCallback(async () => {
    if (!payload) {
      setStatus('error');
      setError('The report payload is missing.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setError('');

    try {
      const response = await fetch(buildApiUrl('/api/reports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Report request failed with status ${response.status}`);
      }

      if (!data?.report) {
        throw new Error('Report response was empty');
      }

      onCompleteRef.current?.(data.report);
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }

      console.error('Report generation failed:', err);
      setStatus('error');
      setError(err.message || 'Report generation failed.');
    }
  }, [payload]);

  useEffect(() => {
    generateReport();

    return () => {
      abortRef.current?.abort();
    };
  }, [generateReport]);

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
      <div style={{ maxWidth: 640, width: '100%' }}>
        <div style={{ fontSize: 12, color: '#ff5c35', fontWeight: 700, letterSpacing: '0.2em', marginBottom: 8 }}>
          SPAR — ANALYZING SESSION
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 10 }}>
          {status === 'loading' ? 'Generating your report' : 'Report generation failed'}
        </h1>
        <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 32 }}>
          {scenario.title} · Backboard is running the code behavior, communication, interviewer dynamic, bug fix, and synthesis agents.
        </p>

        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 14, padding: 24, marginBottom: 24 }}>
          {status === 'loading' ? (
            <>
              <div style={{ display: 'grid', gap: 12 }}>
                {[
                  'Reviewing code-reading and edit behavior',
                  'Scoring communication quality',
                  'Scoring interviewer dynamic',
                  'Evaluating bug fix quality',
                  'Synthesizing final verdict and next steps',
                ].map((step) => (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#ccc' }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: '#ff5c35',
                      boxShadow: '0 0 12px rgba(255,92,53,0.55)',
                    }} />
                    <span style={{ fontSize: 14 }}>{step}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, fontSize: 13, color: '#555' }}>
                This usually takes a few seconds.
              </div>
            </>
          ) : (
            <>
              <div style={{ color: '#ff8c6b', lineHeight: 1.6, marginBottom: 18 }}>
                {error}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={generateReport}
                  style={{
                    background: '#ff5c35',
                    color: '#fff',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Try again
                </button>
                <button
                  onClick={onBack}
                  style={{
                    background: 'transparent',
                    color: '#666',
                    border: '1px solid #333',
                    padding: '12px 20px',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Back to landing
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
