import { useState } from 'react';
import Landing from './screens/Landing';
import Interview from './screens/Interview';
import Report from './screens/Report';
import ReportLoading from './screens/ReportLoading';
import { scenarios } from './data/scenarios';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [selectedScenario, setSelectedScenario] = useState(scenarios[0]);
  const [report, setReport] = useState(null);
  const [reportRequest, setReportRequest] = useState(null);

  if (screen === 'landing') {
    return (
      <Landing
        scenarios={scenarios}
        onStart={(scenario) => {
          setSelectedScenario(scenario);
          setReport(null);
          setReportRequest(null);
          setScreen('interview');
        }}
      />
    );
  }

  if (screen === 'interview') {
    return (
      <Interview
        key={selectedScenario.id}
        scenario={selectedScenario}
        onFinish={(reportData) => {
          setReportRequest(reportData);
          setReport(null);
          setScreen('report-loading');
        }}
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
