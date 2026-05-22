import { useEffect } from 'react';
import Arena from './components/Arena';
import Voting from './components/Voting';
import Scoreboard from './components/Scoreboard';
import { AdminPanel } from './components/AdminPanel';
import WorldArena from './components/WorldArena';
import { WorldControl } from './components/WorldControl';

type View = 'arena' | 'voting' | 'scoreboard' | 'admin' | 'world' | 'control';

const PAGE_TITLES: Record<View, string> = {
  arena: 'Arena | Gambiarra',
  voting: 'Votação | Gambiarra',
  scoreboard: 'Placar | Gambiarra',
  admin: 'Admin | Gambiarra',
  world: 'Mundo | Gambiarra',
  control: 'Controle do Mundo | Gambiarra',
};

function getViewFromPath(): View {
  const path = window.location.pathname;
  if (path === '/voting') return 'voting';
  if (path === '/scoreboard') return 'scoreboard';
  if (path === '/admin') return 'admin';
  if (path === '/world') return 'world';
  if (path === '/control') return 'control';
  return 'arena';
}

function App() {
  const view = getViewFromPath();

  useEffect(() => {
    document.title = PAGE_TITLES[view];
  }, [view]);

  const renderView = () => {
    switch (view) {
      case 'voting':
        return <Voting />;
      case 'scoreboard':
        return <Scoreboard />;
      case 'admin':
        return <AdminPanel />;
      case 'world':
        return <WorldArena />;
      case 'control':
        return <WorldControl />;
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
