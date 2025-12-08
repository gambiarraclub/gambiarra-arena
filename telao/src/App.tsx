import Arena from './components/Arena';
import Voting from './components/Voting';
import Scoreboard from './components/Scoreboard';
import { AdminPanel } from './components/AdminPanel';

type View = 'arena' | 'voting' | 'scoreboard' | 'admin';

function getViewFromPath(): View {
  const path = window.location.pathname;
  if (path === '/voting') return 'voting';
  if (path === '/scoreboard') return 'scoreboard';
  if (path === '/admin') return 'admin';
  return 'arena';
}

function App() {
  const view = getViewFromPath();

  const renderView = () => {
    switch (view) {
      case 'voting':
        return <Voting />;
      case 'scoreboard':
        return <Scoreboard />;
      case 'admin':
        return <AdminPanel />;
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
