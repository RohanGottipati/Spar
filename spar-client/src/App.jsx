import { useState } from 'react';
import Landing from './screens/Landing';
import DifficultySelect from './screens/DifficultySelect';
import ScenarioSelect from './screens/ScenarioSelect';
import Interview from './screens/Interview';
import Report from './screens/Report';
import ReportLoading from './screens/ReportLoading';
import { scenarios } from './data/scenarios';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [selectedDifficulty, setSelectedDifficulty] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [report, setReport] = useState(null);
  const [reportRequest, setReportRequest] = useState(null);

  if (screen === 'landing') {
    return (
      <Landing
        scenarios={scenarios}
        onStart={() => setScreen('difficulty')}
      />
    );
  }

  if (screen === 'difficulty') {
    return (
      <DifficultySelect
        scenarios={scenarios}
        onSelect={(difficulty) => {
          setSelectedDifficulty(difficulty);
          setScreen('scenario');
        }}
        onBack={() => setScreen('landing')}
      />
    );
  }

  if (screen === 'scenario') {
    const filtered = scenarios.filter(s => s.difficulty === selectedDifficulty);
    return (
      <ScenarioSelect
        scenarios={filtered}
        difficulty={selectedDifficulty}
        onSelect={(scenario) => {
          setSelectedScenario(scenario);
          setReport(null);
          setReportRequest(null);
          setScreen('interview');
        }}
        onBack={() => setScreen('difficulty')}
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
      />
    );
  }

  if (screen === 'report-loading') {
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
