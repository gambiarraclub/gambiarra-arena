import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './Toast';
import QRCodeGenerator from './QRCodeGenerator';

interface Session {
  id: string;
  pin: string;
  status: string;
}

interface WorldAgent {
  id: string;
  nickname: string;
  emoji: string;
  color: string;
  score: number;
  isBot: boolean;
}

interface WorldState {
  running: boolean;
  objective: string;
  agents: WorldAgent[];
  food: { id: string }[];
}

const API_BASE = '/api';

const OBJECTIVE_PRESETS = [
  'Colete o máximo de comidas que conseguir!',
  'Corrida: seja o primeiro a coletar 10 comidas.',
  'Explore a arena e colete tudo que encontrar.',
];

export function WorldControl() {
  const toast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [world, setWorld] = useState<WorldState | null>(null);
  const [loading, setLoading] = useState(false);

  // form
  const [objective, setObjective] = useState(OBJECTIVE_PRESETS[0]);
  const [foodCount, setFoodCount] = useState(16);
  const [bots, setBots] = useState(0);

  const agentUrl = `${window.location.protocol}//${window.location.hostname}:3000/agent`;
  const worldUrl = '/world';

  const loadSession = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/session`);
      if (r.ok) setSession(await r.json());
      else setSession(null);
    } catch {
      /* ignore */
    }
  }, []);

  const loadWorld = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/world/state`);
      if (r.status === 429) return;
      if (r.ok) setWorld(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadSession();
    loadWorld();
    const i = setInterval(loadWorld, 1500);
    return () => clearInterval(i);
  }, [loadSession, loadWorld]);

  const createSession = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinLength: 6 }),
      });
      if (r.ok) {
        const data = await r.json();
        toast.success(`Sessão criada! PIN: ${data.pin}`);
        await loadSession();
      } else {
        toast.error('Erro ao criar sessão');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const startWorld = async () => {
    if (!session) {
      toast.error('Crie uma sessão primeiro');
      return;
    }
    if (!objective.trim()) {
      toast.error('Defina um objetivo');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/world/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, foodCount, bots }),
      });
      if (r.ok) {
        toast.success('Mundo iniciado! 🌍');
        loadWorld();
      } else {
        toast.error('Erro ao iniciar o mundo');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const stopWorld = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/world/stop`, { method: 'POST' });
      if (r.ok) {
        toast.success('Mundo parado e limpo');
        loadWorld();
      } else {
        toast.error('Erro ao parar o mundo');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const running = world?.running ?? false;
  const agents = world?.agents ?? [];
  const humans = agents.filter((a) => !a.isBot);
  const sorted = [...agents].sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 lg:p-8">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold">
            🌍 Controle do Mundo
          </h1>
          <a
            href={worldUrl}
            target="_blank"
            rel="noreferrer"
            className="bg-orange-600 hover:bg-orange-700 px-5 py-2 rounded-lg font-bold"
          >
            📺 Abrir telão /world
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Session + join */}
          <div className="lg:col-span-1 bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4">Sessão</h2>
            {session ? (
              <>
                <p className="text-sm text-gray-400 mb-1">PIN</p>
                <p className="text-green-400 text-5xl font-mono font-bold tracking-widest mb-3">
                  {session.pin}
                </p>
                <button
                  onClick={createSession}
                  disabled={loading}
                  className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1.5 rounded text-xs font-bold disabled:opacity-50 mb-5"
                >
                  🔄 Nova sessão
                </button>

                <div className="border-t border-gray-700 pt-4">
                  <p className="text-sm text-gray-400 mb-2">Participantes entram em:</p>
                  <div className="bg-white rounded-lg p-3 inline-block mb-2">
                    <QRCodeGenerator value={agentUrl} size={150} />
                  </div>
                  <p className="text-cyan-400 font-mono text-sm break-all">{agentUrl}</p>
                </div>
              </>
            ) : (
              <div>
                <p className="mb-4 text-gray-400">Nenhuma sessão ativa.</p>
                <button
                  onClick={createSession}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold disabled:opacity-50 w-full"
                >
                  Criar sessão
                </button>
              </div>
            )}
          </div>

          {/* World config + status */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Configurar partida</h2>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold ${
                    running ? 'bg-green-600' : 'bg-gray-600'
                  }`}
                >
                  {running ? '● AO VIVO' : '○ parado'}
                </span>
              </div>

              <label className="block text-sm text-gray-400 mb-1">Objetivo</label>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                rows={2}
                className="w-full bg-gray-700 text-white p-3 rounded-lg mb-2"
                placeholder="O que os agentes devem fazer?"
              />
              <div className="flex flex-wrap gap-2 mb-4">
                {OBJECTIVE_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setObjective(p)}
                    className="text-xs px-2 py-1 rounded bg-gray-600 hover:bg-gray-500"
                  >
                    {p.slice(0, 28)}…
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Comidas na arena</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={foodCount}
                    onChange={(e) => setFoodCount(Number(e.target.value))}
                    className="w-full bg-gray-700 text-white p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Bots de teste <span className="text-gray-600">(0 = só LLMs reais)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={bots}
                    onChange={(e) => setBots(Number(e.target.value))}
                    className="w-full bg-gray-700 text-white p-2 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={startWorld}
                  disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold text-lg disabled:opacity-50"
                >
                  ▶️ {running ? 'Reiniciar partida' : 'Iniciar partida'}
                </button>
                <button
                  onClick={stopWorld}
                  disabled={loading || !running}
                  className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-bold text-lg disabled:opacity-50"
                >
                  ⏹️ Parar
                </button>
              </div>
              {running && (
                <p className="text-xs text-gray-500 mt-2">
                  Reiniciar mantém os agentes conectados, zera comidas e redefine o objetivo.
                </p>
              )}
            </div>

            {/* Live status */}
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Ao vivo</h2>
                <div className="flex gap-4 text-sm">
                  <span>
                    <span className="text-cyan-400 font-bold text-lg">{humans.length}</span>{' '}
                    <span className="text-gray-400">agentes</span>
                  </span>
                  <span>
                    <span className="text-green-400 font-bold text-lg">{world?.food.length ?? 0}</span>{' '}
                    <span className="text-gray-400">comidas</span>
                  </span>
                </div>
              </div>

              {sorted.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  Nenhum agente no mundo ainda. Compartilhe o PIN e o link acima.
                </p>
              ) : (
                <div className="space-y-2">
                  {sorted.map((a, i) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 bg-gray-700/50 rounded-lg px-3 py-2"
                    >
                      <span className="text-gray-500 w-5 text-right font-mono">{i + 1}</span>
                      <span className="text-xl">{a.emoji}</span>
                      <span className="flex-1 font-bold truncate" style={{ color: a.color }}>
                        {a.nickname}
                        {a.isBot && <span className="text-gray-500 text-xs ml-2">(bot)</span>}
                      </span>
                      <span className="text-green-400 font-mono font-bold">{a.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <a href="/" className="text-blue-400 hover:text-blue-300">
            ← Voltar para o telão
          </a>
        </div>
      </div>
    </div>
  );
}
