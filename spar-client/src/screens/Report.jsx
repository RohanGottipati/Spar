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
  sectionEyebrowStyle,
} from '../lib/experienceTheme';

function formatDuration(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  if (safeSeconds < 120) {
    return `${safeSeconds}s`;
  }
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}m ${secs}s`;
}

function formatTimeToFirstEdit(seconds) {
  if (!Number.isFinite(seconds)) {
    return 'No edit recorded';
  }

  return `${seconds}s`;
}

function getVerdictColor(verdict) {
  if (verdict === 'Strong Hire') {
    return EXPERIENCE_COLORS.success;
  }

  if (verdict === 'Hire' || verdict === 'Leaning Hire') {
    return EXPERIENCE_COLORS.info;
  }

  if (verdict === 'Leaning No Hire') {
    return EXPERIENCE_COLORS.warning;
  }

  return EXPERIENCE_COLORS.danger;
}

const REPORT_DIMENSION_LABELS = {
  code_behavior: 'Code Behavior',
  communication_quality: 'Communication Quality',
  interviewer_dynamic: 'Interviewer Dynamic',
  bug_fix_quality: 'Bug Fix Quality',
};

function buildDegradedAnalysisSummary(report) {
  const analysisStatus = report?.analysisStatus;
  if (!analysisStatus?.degraded) {
    return '';
  }

  const dimensionLabels = new Map(
    (Array.isArray(report?.dimensions) ? report.dimensions : []).map((dimension) => [dimension.key, dimension.label])
  );
  const failedLabels = (Array.isArray(analysisStatus.failedDimensions) ? analysisStatus.failedDimensions : [])
    .map((key) => dimensionLabels.get(key) || REPORT_DIMENSION_LABELS[key] || key)
    .filter(Boolean);

  if (failedLabels.length && analysisStatus.usedFallbackSynthesis) {
    return `Some AI analysis degraded for ${failedLabels.join(', ')}, and Spar used a fallback synthesis to finish the report.`;
  }

  if (failedLabels.length) {
    return `Some AI analysis degraded for ${failedLabels.join(', ')}, so parts of this report use fallback scoring text.`;
  }

  if (analysisStatus.usedFallbackSynthesis) {
    return 'The final AI synthesis degraded, so Spar used a fallback summary to complete this report.';
  }

  return '';
}

function buildDefaultDeliveredFixes(scenarioSummary) {
  const fixes = [];

  if (scenarioSummary.fixSummary) {
    fixes.push(scenarioSummary.fixSummary);
  }

  fixes.push('The final patch should attack the root cause directly instead of retrying or masking the symptom.');
  fixes.push('Any follow-up hardening work should be separated from the incident fix so the primary regression is clearly closed.');

  return fixes.slice(0, 3);
}

function buildDefaultRegressionNet(scenarioSummary) {
  const title = scenarioSummary.title || 'the original failure';

  return [
    `Replay ${title.toLowerCase()} and assert the bad production behavior no longer occurs.`,
    'Exercise the nearest edge case around the same handler so the fix does not break adjacent flows.',
    'Add an automated regression that locks in both the API response and the final persisted state.',
  ];
}

function buildDefaultRiskReview({ scenarioSummary, meta, scenario, topDimension }) {
  return [
    {
      label: 'Bug Location',
      value: `${scenario?.bugLocation || 'Unknown'}${scenario?.bugLine ? `:${scenario.bugLine}` : ''}`,
      tone: 'warning',
    },
    {
      label: 'Top Signal',
      value: topDimension?.label || 'Pending analysis',
      tone: 'info',
    },
    {
      label: 'Session Length',
      value: formatDuration(meta.durationSeconds),
      tone: 'success',
    },
  ];
}

function getRiskToneColor(tone) {
  if (tone === 'success') {
    return EXPERIENCE_COLORS.success;
  }

  if (tone === 'info') {
    return EXPERIENCE_COLORS.info;
  }

  if (tone === 'warning') {
    return EXPERIENCE_COLORS.warning;
  }

  return EXPERIENCE_COLORS.accent;
}

export default function Report({ report, scenario, onRetry }) {
  const dimensions = Array.isArray(report?.dimensions) ? report.dimensions : [];
  const meta = report?.sessionMeta || {};
  const scenarioSummary = {
    title: report?.scenarioSummary?.title || scenario?.title || '',
    company: report?.scenarioSummary?.company || scenario?.company || '',
    difficulty: report?.scenarioSummary?.difficulty || scenario?.difficulty || '',
    bugExplanation: report?.scenarioSummary?.bugExplanation || scenario?.bugExplanation || '',
    fixSummary: report?.scenarioSummary?.fixSummary || scenario?.fixSummary || '',
  };
  const dashboard = report?.dashboard || {};
  const verdictColor = getVerdictColor(report?.verdict);
  const degradedAnalysisSummary = buildDegradedAnalysisSummary(report);
  const difficultyAccent = getDifficultyAccent(scenarioSummary.difficulty);
  const topDimension = dimensions.slice().sort((a, b) => b.score - a.score)[0];
  const deliveredFixes = Array.isArray(dashboard.deliveredFixes) && dashboard.deliveredFixes.length > 0
    ? dashboard.deliveredFixes
    : buildDefaultDeliveredFixes(scenarioSummary);
  const regressionNet = Array.isArray(dashboard.regressionNet) && dashboard.regressionNet.length > 0
    ? dashboard.regressionNet
    : buildDefaultRegressionNet(scenarioSummary);
  const riskReview = Array.isArray(dashboard.preventedRisks) && dashboard.preventedRisks.length > 0
    ? dashboard.preventedRisks
    : buildDefaultRiskReview({ scenarioSummary, meta, scenario, topDimension });

  return (
    <div style={experiencePageStyle}>
      <div style={experienceOverlayStyle} />

      <nav style={experienceNavStyle}>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>Spar</span>
        <div />
        <button onClick={onRetry} style={primaryButtonStyle}>
          Start another session
        </button>
      </nav>

      <div style={experienceContentStyle}>
        <div style={{ maxWidth: 920, margin: '0 auto 26px', textAlign: 'center' }}>
          <div style={{ ...sectionEyebrowStyle, textAlign: 'center' }}>Session Report</div>

          <p style={{ color: EXPERIENCE_COLORS.mutedText, fontSize: 18, lineHeight: 1.75, maxWidth: 780, margin: '0 auto' }}>
            {scenarioSummary.title} for {scenarioSummary.company} is broken down into verdict, execution quality, shipped fix direction, and the regression protection that should exist before this goes back to production.
          </p>
        </div>

        {degradedAnalysisSummary && (
          <div
            style={{
              ...buildGlassPanelStyle({
                padding: 18,
                background: 'rgba(31,17,14,0.72)',
                borderColor: 'rgba(255,140,107,0.26)',
              }),
              marginBottom: 18,
            }}
          >
            <div style={{ ...sectionEyebrowStyle, color: EXPERIENCE_COLORS.danger, marginBottom: 8 }}>
              Partial Analysis
            </div>
            <p style={{ color: '#f0c2b5', lineHeight: 1.65, margin: 0 }}>
              {degradedAnalysisSummary}
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(300px, 0.85fr)', gap: 18, marginBottom: 18 }}>
          <div style={buildGlassPanelStyle({ padding: 28, background: EXPERIENCE_COLORS.panelBgStrong })}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              <span style={buildTagStyle(difficultyAccent, `${difficultyAccent}20`)}>
                {scenarioSummary.difficulty}
              </span>
              <span style={buildTagStyle(EXPERIENCE_COLORS.info, 'rgba(91,156,246,0.16)')}>
                {scenarioSummary.company}
              </span>
              <span style={buildTagStyle(EXPERIENCE_COLORS.accent, 'rgba(255,92,53,0.16)')}>
                {scenarioSummary.title}
              </span>
            </div>

            <div style={{ color: EXPERIENCE_COLORS.subtleText, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
              Final Verdict
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
              <div style={{ fontSize: 'clamp(2.4rem, 4.4vw, 3.5rem)', fontWeight: 700, letterSpacing: '-0.04em', color: verdictColor }}>
                {report?.verdict || 'Pending'}
              </div>
              {topDimension && (
                <div style={{ color: EXPERIENCE_COLORS.mutedText, maxWidth: 260, lineHeight: 1.6 }}>
                  Strongest signal: <span style={{ color: EXPERIENCE_COLORS.text }}>{topDimension.label}</span>
                </div>
              )}
            </div>

            <p style={{ color: EXPERIENCE_COLORS.mutedText, fontSize: 16, lineHeight: 1.8, marginBottom: 20 }}>
              {report?.verdictSummary}
            </p>

            {(dashboard.heading || dashboard.summary) && (
              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {dashboard.heading && (
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                    {dashboard.heading}
                  </div>
                )}
                {dashboard.summary && (
                  <p style={{ color: EXPERIENCE_COLORS.mutedText, lineHeight: 1.7, margin: 0 }}>
                    {dashboard.summary}
                  </p>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <MetricCard label="Duration" value={formatDuration(meta.durationSeconds)} />
            <MetricCard label="Files Opened" value={`${meta.filesOpened || 0}`} />
            <MetricCard label="Utterances" value={`${meta.utteranceCount || 0}`} />
            <MetricCard label="Time To First Edit" value={formatTimeToFirstEdit(meta.timeToFirstEditSeconds)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 18 }}>
          {dimensions.map((dimension) => (
            <DimensionCard key={dimension.key} dimension={dimension} />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, marginBottom: 18 }}>
          <InfoPanel title="Root Cause" eyebrow="Incident" accent={EXPERIENCE_COLORS.accent}>
            <p style={{ color: EXPERIENCE_COLORS.mutedText, lineHeight: 1.75, margin: 0 }}>
              {scenarioSummary.bugExplanation || 'The final report did not include the bug summary.'}
            </p>
            <div style={{ marginTop: 18, color: EXPERIENCE_COLORS.subtleText, fontSize: 13 }}>
              Bug location: {scenario?.bugLocation || 'Unknown'}{scenario?.bugLine ? `:${scenario.bugLine}` : ''}
            </div>
          </InfoPanel>

          <ListPanel
            title="Solution Delivered"
            eyebrow="Fix Direction"
            accent={EXPERIENCE_COLORS.success}
            items={deliveredFixes}
          />

          <ListPanel
            title="Regression Net"
            eyebrow="Quality Bar"
            accent={EXPERIENCE_COLORS.info}
            items={regressionNet}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          <InfoPanel title="Risk Review" eyebrow="Operating Readiness" accent={EXPERIENCE_COLORS.warning}>
            <div style={{ display: 'grid', gap: 12 }}>
              {riskReview.map((risk) => (
                <div
                  key={`${risk.label}-${risk.value}`}
                  style={{
                    padding: '16px 18px',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ color: EXPERIENCE_COLORS.subtleText, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {risk.label}
                  </div>
                  <div style={{ color: getRiskToneColor(risk.tone), fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
                    {risk.value}
                  </div>
                </div>
              ))}
            </div>
          </InfoPanel>

          <ListPanel
            title="What To Work On Next"
            eyebrow="Coaching"
            accent={EXPERIENCE_COLORS.accent}
            items={report?.nextSteps || []}
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div style={buildGlassPanelStyle({ padding: 20, background: 'rgba(8,10,16,0.58)' })}>
      <div style={{ color: EXPERIENCE_COLORS.subtleText, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>
        {value}
      </div>
    </div>
  );
}

function DimensionCard({ dimension }) {
  const maxScore = Number.isFinite(dimension?.maxScore) ? dimension.maxScore : 10;
  const score = Number.isFinite(dimension?.score) ? dimension.score : 0;
  const pct = Math.round((score / maxScore) * 100);
  const color = pct >= 85
    ? EXPERIENCE_COLORS.success
    : pct >= 70
      ? EXPERIENCE_COLORS.info
      : pct >= 50
        ? EXPERIENCE_COLORS.warning
        : EXPERIENCE_COLORS.danger;

  return (
    <div style={buildGlassPanelStyle({ padding: 20, background: 'rgba(8,10,16,0.58)' })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.35 }}>
          {dimension.label}
        </div>
        <div
          style={{
            minWidth: 58,
            padding: '8px 10px',
            borderRadius: 999,
            background: `${color}18`,
            color,
            fontSize: 13,
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          {score}/{maxScore}
        </div>
      </div>

      <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>

      <p style={{ color: EXPERIENCE_COLORS.mutedText, lineHeight: 1.7, margin: 0 }}>
        {dimension.summary}
      </p>
    </div>
  );
}

function InfoPanel({ title, eyebrow, accent, children }) {
  return (
    <div style={buildGlassPanelStyle({ padding: 24, background: EXPERIENCE_COLORS.panelBgStrong })}>
      <div style={{ ...sectionEyebrowStyle, color: accent }}>
        {eyebrow}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', margin: '12px 0 16px' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ListPanel({ title, eyebrow, accent, items }) {
  return (
    <InfoPanel title={title} eyebrow={eyebrow} accent={accent}>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((item, index) => (
          <div
            key={`${index}-${item}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr',
              gap: 12,
              alignItems: 'start',
              padding: '16px 18px',
              borderRadius: 14,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: `${accent}18`,
                color: accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {index + 1}
            </div>
            <div style={{ color: EXPERIENCE_COLORS.mutedText, lineHeight: 1.7 }}>
              {item}
            </div>
          </div>
        ))}
      </div>
    </InfoPanel>
  );
}
