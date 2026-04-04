import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../lib/api';
import {
  EXPERIENCE_COLORS,
  buildGlassPanelStyle,
  buildTagStyle,
  experienceContentStyle,
  experienceNavStyle,
  experienceOverlayStyle,
  experiencePageStyle,
  getDifficultyAccent,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionEyebrowStyle,
} from '../lib/experienceTheme';
import { buildCheckoutBugBenchmarkReport, isCheckoutBugBenchmarkScenario } from '../lib/mockReports';

const LOADING_STEPS = [
  {
    title: 'Reviewing the session trail',
    detail: 'Inspecting file opens, edits, and the shape of the debugging loop.',
  },
  {
    title: 'Scoring communication',
    detail: 'Checking whether the reasoning stayed concrete, direct, and technically sound.',
  },
  {
    title: 'Evaluating the fix',
    detail: 'Comparing the final direction against the scenario answer key and regression risk.',
  },
  {
    title: 'Assembling the dashboard',
    detail: 'Packaging the final verdict, solution notes, and coaching points.',
  },
];

function waitWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener?.('abort', handleAbort);
      resolve();
    }, ms);

    function handleAbort() {
      window.clearTimeout(timeoutId);
      reject(new DOMException('Request aborted', 'AbortError'));
    }

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true });
    }
  });
}

function formatScenarioDuration(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  return `${Math.max(1, Math.round(safeSeconds / 60))} min session`;
}

export default function ReportLoading({ payload, scenario, onComplete, onBack }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const abortRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  const benchmarkPreview = isCheckoutBugBenchmarkScenario(scenario);
  const difficultyAccent = getDifficultyAccent(scenario?.difficulty);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (status !== 'loading') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % LOADING_STEPS.length);
    }, 1200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [status]);

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
      if (benchmarkPreview) {
        await waitWithAbort(4600, controller.signal);
        onCompleteRef.current?.(buildCheckoutBugBenchmarkReport({ scenario }));
        return;
      }

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
  }, [benchmarkPreview, payload, scenario]);

  useEffect(() => {
    generateReport();

    return () => {
      abortRef.current?.abort();
    };
  }, [generateReport]);

  return (
    <div style={experiencePageStyle}>
      <div style={experienceOverlayStyle} />

      <nav style={experienceNavStyle}>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>Spar</span>
        <div />
        <button onClick={onBack} style={secondaryButtonStyle}>
          Back to landing
        </button>
      </nav>

      <div style={experienceContentStyle}>
        <div style={{ maxWidth: 860, margin: '0 auto 28px', textAlign: 'center' }}>
          <div style={{ ...sectionEyebrowStyle, textAlign: 'center' }}>Session Report</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', margin: '14px 0 16px' }}>
            <h1 style={{ fontSize: 'clamp(2.6rem, 5vw, 4rem)', fontWeight: 500, lineHeight: 1.02, letterSpacing: '-0.05em', margin: 0 }}>
              {status === 'loading' ? 'Generating your report' : 'Report generation failed'}
            </h1>
          </div>

          <p style={{ color: EXPERIENCE_COLORS.mutedText, fontSize: 18, lineHeight: 1.7, maxWidth: 760, margin: '0 auto' }}>
            {scenario?.title} for {scenario?.company} is being turned into the same structured dashboard you would expect from a polished final hiring panel.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          <div style={buildGlassPanelStyle({ padding: 28, background: EXPERIENCE_COLORS.panelBgStrong })}>
            {status === 'loading' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ ...sectionEyebrowStyle, textAlign: 'center' }}>Progress</div>
                    <div style={{ marginTop: 10, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>
                      Analysis in motion
                    </div>
                  </div>
                  <div style={buildTagStyle(difficultyAccent, `${difficultyAccent}20`)}>
                    {scenario?.difficulty}
                  </div>
                </div>

                <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 24 }}>
                  <div
                    style={{
                      width: `${((activeStep + 1) / LOADING_STEPS.length) * 100}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${EXPERIENCE_COLORS.accent} 0%, ${difficultyAccent} 100%)`,
                      borderRadius: 999,
                      transition: 'width 0.35s ease',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gap: 14 }}>
                  {LOADING_STEPS.map((step, index) => {
                    const isActive = index === activeStep;
                    const isComplete = index < activeStep;
                    const tone = isActive || isComplete ? EXPERIENCE_COLORS.text : EXPERIENCE_COLORS.subtleText;

                    return (
                      <div
                        key={step.title}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '22px 1fr',
                          gap: 14,
                          alignItems: 'start',
                          padding: '14px 16px',
                          borderRadius: 14,
                          background: isActive ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: isComplete || isActive ? EXPERIENCE_COLORS.accent : 'rgba(255,255,255,0.08)',
                            boxShadow: isActive ? '0 0 18px rgba(255,92,53,0.32)' : 'none',
                            marginTop: 2,
                          }}
                        />
                        <div>
                          <div style={{ color: tone, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                            {step.title}
                          </div>
                          <div style={{ color: EXPERIENCE_COLORS.mutedText, fontSize: 14, lineHeight: 1.6 }}>
                            {step.detail}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 18, color: EXPERIENCE_COLORS.subtleText, fontSize: 13, textAlign: 'center' }}>
                  This usually takes a few seconds.
                </div>
              </>
            ) : (
              <>
                <div style={{ ...sectionEyebrowStyle, textAlign: 'center' }}>Something Broke</div>
                <div style={{ margin: '12px 0 12px', fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', textAlign: 'center' }}>
                  The report could not be assembled
                </div>
                <p style={{ color: EXPERIENCE_COLORS.mutedText, lineHeight: 1.7, marginBottom: 20, textAlign: 'center' }}>
                  {error}
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button onClick={generateReport} style={primaryButtonStyle}>
                    Try again
                  </button>
                  <button onClick={onBack} style={secondaryButtonStyle}>
                    Back to landing
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'grid', gap: 18 }}>
            <div style={buildGlassPanelStyle({ padding: 24, background: 'rgba(8,10,16,0.58)' })}>
              <div style={sectionEyebrowStyle}>Scenario Snapshot</div>
              <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.03em', margin: '12px 0 14px' }}>
                {scenario?.title}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <span style={buildTagStyle(difficultyAccent, `${difficultyAccent}20`)}>
                  {scenario?.difficulty}
                </span>
                <span style={buildTagStyle(EXPERIENCE_COLORS.info, 'rgba(91,156,246,0.16)')}>
                  {scenario?.company}
                </span>
                <span style={buildTagStyle(EXPERIENCE_COLORS.accent, 'rgba(255,92,53,0.16)')}>
                  {formatScenarioDuration(scenario?.timeLimit)}
                </span>
              </div>

              <p style={{ color: EXPERIENCE_COLORS.mutedText, lineHeight: 1.7, marginBottom: 18 }}>
                {scenario?.description}
              </p>

              <div style={{ display: 'grid', gap: 12 }}>
                <PreviewStat label="Bug Location" value={`${scenario?.bugLocation || 'Unknown'}:${scenario?.bugLine || '?'}`} />
                <PreviewStat label="Report Output" value={benchmarkPreview ? 'Reference benchmark dashboard' : 'Live analysis dashboard'} />
              </div>
            </div>

            <div style={buildGlassPanelStyle({ padding: 24, background: 'rgba(8,10,16,0.58)' })}>
              <div style={sectionEyebrowStyle}>Inside The Report</div>
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                {[
                  'Verdict card with coaching-quality summary',
                  'Dimension scorecards for debugging, communication, and fix quality',
                  'Root-cause, shipped-fix, and regression-net panels',
                ].map((item) => (
                  <div
                    key={item}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      color: EXPERIENCE_COLORS.mutedText,
                      lineHeight: 1.55,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 6,
        padding: '14px 16px',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ color: EXPERIENCE_COLORS.subtleText, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color: EXPERIENCE_COLORS.text, fontSize: 15, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
