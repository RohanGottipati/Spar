import { useState } from 'react';
import Landing from './screens/Landing';
import Interview from './screens/Interview';
import Report from './screens/Report';
import { scenarios } from './data/scenarios';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [selectedScenario, setSelectedScenario] = useState(scenarios[0]);
  const [report, setReport] = useState(null);

  if (screen === 'landing') {
    return (
      <Landing
        scenarios={scenarios}
        onStart={(scenario) => { setSelectedScenario(scenario); setScreen('interview'); }}
      />
    );
  }

  if (screen === 'interview') {
    return (
      <Interview
        scenario={selectedScenario}
        onFinish={(reportData) => { setReport(reportData); setScreen('report'); }}
      />
    );
  }

  if (screen === 'report') {
    return <Report report={report} scenario={selectedScenario} onRetry={() => setScreen('landing')} />;
  }
}
