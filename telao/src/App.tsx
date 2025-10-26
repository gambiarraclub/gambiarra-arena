import { useState, useEffect } from 'react';
import Arena from './components/Arena';
import Voting from './components/Voting';
import Scoreboard from './components/Scoreboard';

function App() {
  const [view, setView] = useState<'arena' | 'voting' | 'scoreboard'>('arena');
  const params = new URLSearchParams(window.location.search);
  const initialView = params.get('view') as 'arena' | 'voting' | 'scoreboard' | null;

  useEffect(() => {
    if (initialView) {
      setView(initialView);
    }
  }, [initialView]);

  const renderView = () => {
    switch (view) {
      case 'voting':
        return <Voting />;
      case 'scoreboard':
        return <Scoreboard />;
      default:
        return <Arena />;
    }
  };

  return (
    <div className="min-h-screen bg-dark">
      {renderView()}
    </div>
  );
}

export default App;
