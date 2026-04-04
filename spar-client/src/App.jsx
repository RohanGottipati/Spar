import { useCallback, useEffect, useState } from 'react';
import Landing from './screens/Landing';
import DifficultySelect from './screens/DifficultySelect';
import ScenarioSelect from './screens/ScenarioSelect';
import Interview from './screens/Interview';
import Report from './screens/Report';
import ReportLoading from './screens/ReportLoading';
import { buildApiUrl } from './lib/api';

export default function App() {
  const [scenarios, setScenarios] = useState([]);
  const [scenarioStatus, setScenarioStatus] = useState('loading');
  const [scenarioError, setScenarioError] = useState('');
  const [scenarioNotice, setScenarioNotice] = useState('');
  const [screen, setScreen] = useState('landing');
  const [selectedDifficulty, setSelectedDifficulty] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [report, setReport] = useState(null);
  const [reportRequest, setReportRequest] = useState(null);

  const loadScenarios = useCallback(async ({ signal } = {}) => {
    setScenarioStatus((currentStatus) => (
      currentStatus === 'ready' ? 'refreshing' : 'loading'
    ));
    setScenarioError('');

    try {
      const response = await fetch(buildApiUrl('/api/scenarios'), { signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Scenario request failed with status ${response.status}`);
      }

      if (!Array.isArray(data)) {
        throw new Error('Scenario response was invalid');
      }

      setScenarios(data);
      setScenarioStatus('ready');
      return data;
    } catch (err) {
      if (signal?.aborted) {
        return null;
      }

      console.error('Failed to load scenarios:', err);
      setScenarioStatus('error');
      setScenarioError(err.message || 'Could not load scenarios.');
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadScenarios({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [loadScenarios]);

  useEffect(() => {
    if (!selectedScenario) {
      return;
    }

    const refreshedScenario = scenarios.find((scenario) => scenario.id === selectedScenario.id) || null;
    if (!refreshedScenario) {
      setSelectedScenario(null);
      if (screen === 'interview') {
        setScreen('scenario');
      }
      return;
    }

    if (refreshedScenario !== selectedScenario) {
      setSelectedScenario(refreshedScenario);
    }
  }, [scenarios, screen, selectedScenario]);

  const handleScenarioUnavailable = useCallback(({ message } = {}) => {
    setScenarioNotice(message || 'That scenario is unavailable right now. Pick another one.');
    setSelectedScenario(null);
    setScreen('scenario');
    void loadScenarios();
  }, [loadScenarios]);

  if (scenarioStatus === 'loading' && !scenarios.length) {
    return (
      <CatalogState
        title="Loading scenarios"
        description="Fetching the interview catalog from the server so every scenario is launchable."
      />
    );
  }

  if (scenarioStatus === 'error' && !scenarios.length) {
    return (
      <CatalogState
        title="Could not load scenarios"
        description={scenarioError || 'The scenario catalog is unavailable right now.'}
        actionLabel="Try again"
        onAction={() => {
          void loadScenarios();
        }}
      />
    );
  }

  if (screen === 'landing') {
    return (
      <Landing
        scenarios={scenarios}
        onStart={() => {
          setScenarioNotice('');
          setScreen('difficulty');
        }}
      />
    );
  }

  if (screen === 'difficulty') {
    return (
      <DifficultySelect
        scenarios={scenarios}
        onSelect={(difficulty) => {
          setSelectedDifficulty(difficulty);
          setScenarioNotice('');
          setScreen('scenario');
        }}
        onBack={() => {
          setScenarioNotice('');
          setScreen('landing');
        }}
      />
    );
  }

  if (screen === 'scenario') {
    const filtered = scenarios.filter(s => s.difficulty === selectedDifficulty);
    return (
      <ScenarioSelect
        scenarios={filtered}
        difficulty={selectedDifficulty}
        notice={scenarioNotice}
        onSelect={(scenario) => {
          setSelectedScenario(scenario);
          setReport(null);
          setReportRequest(null);
          setScenarioNotice('');
          setScreen('interview');
        }}
        onBack={() => {
          setScenarioNotice('');
          setScreen('difficulty');
        }}
      />
    );
  }

  if (screen === 'interview') {
    if (!selectedScenario) return null;
    return (
      <Interview
        key={selectedScenario.id}
        scenario={selectedScenario}
        onFinish={(reportData) => {
          setReportRequest(reportData);
          setReport(null);
          setScreen('report-loading');
        }}
        onBack={() => setScreen('scenario')}
        onScenarioUnavailable={handleScenarioUnavailable}
      />
    );
  }

  if (screen === 'report-loading') {
    if (!selectedScenario) return null;
    return (
      <ReportLoading
        payload={reportRequest}
        scenario={selectedScenario}
        onComplete={(nextReport) => {
          setReport(nextReport);
          setScreen('report');
        }}
        onBack={() => {
          setReport(null);
          setReportRequest(null);
          setScreen('landing');
        }}
      />
    );
  }

  if (screen === 'report') {
    if (!selectedScenario) return null;
    return (
      <Report
        report={report}
        scenario={selectedScenario}
        onRetry={() => {
          setReport(null);
          setReportRequest(null);
          setScreen('landing');
        }}
      />
    );
  }

  return null;
}

function CatalogState({ title, description, actionLabel = '', onAction = null }) {
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
      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#ff5c35', fontWeight: 700, letterSpacing: '0.2em', marginBottom: 8 }}>
          SPAR
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>{title}</h1>
        <p style={{ color: '#666', lineHeight: 1.7, marginBottom: actionLabel ? 28 : 0 }}>
          {description}
        </p>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            style={{
              background: '#ff5c35',
              color: '#fff',
              border: 'none',
              padding: '12px 22px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
