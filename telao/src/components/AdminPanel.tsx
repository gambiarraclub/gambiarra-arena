import { useState, useEffect } from 'react';

interface Session {
  id: string;
  pin: string;
  status: string;
  createdAt: string;
}

interface Round {
  id: string;
  sessionId: string;
  index: number;
  prompt: string;
  maxTokens: number;
  temperature: number;
  deadlineMs: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt?: string;
}

export function AdminPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionPin, setSessionPin] = useState<string | null>(null);

  // Form states
  const [newPrompt, setNewPrompt] = useState('');
  const [maxTokens, setMaxTokens] = useState(500);
  const [temperature, setTemperature] = useState(0.7);
  const [deadlineMs, setDeadlineMs] = useState(120000);

  // Predefined prompt templates
  const promptTemplates = [
    'Escreva uma poesia em métrica de xote pernambucano sobre IA',
    'Conte uma história curta de ficção científica sobre robôs',
    'Explique o conceito de entropia de forma criativa',
    'Escreva um diálogo entre dois personagens históricos',
    'Crie uma receita maluca com ingredientes inusitados',
  ];

  // Compute round status based on startedAt/endedAt
  const getRoundStatus = (round: Round): 'pending' | 'active' | 'completed' => {
    if (round.endedAt) return 'completed';
    if (round.startedAt) return 'active';
    return 'pending';
  };

  const API_BASE = '/api';

  useEffect(() => {
    loadSession();
    // Load PIN from localStorage if exists
    const savedPin = localStorage.getItem('gambiarra_session_pin');
    if (savedPin) {
      setSessionPin(savedPin);
    }
  }, []);

  const loadSession = async () => {
    try {
      const response = await fetch(`${API_BASE}/session`);
      if (response.ok) {
        const data = await response.json();
        setSession(data);
        loadRounds();
      }
    } catch (err) {
      console.error('Error loading session:', err);
    }
  };

  const loadRounds = async () => {
    try {
      const response = await fetch(`${API_BASE}/session`);
      if (response.ok) {
        const data = await response.json();
        console.log('Session data:', data);
        setRounds(data.rounds || []);
      }
    } catch (err) {
      console.error('Error loading rounds:', err);
    }
  };

  const createSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinLength: 6 })
      });
      if (response.ok) {
        const data = await response.json();
        setSession(data);
        setSessionPin(data.pin);
        // Save PIN to localStorage
        localStorage.setItem('gambiarra_session_pin', data.pin);
        localStorage.setItem('gambiarra_session_id', data.session_id);
        alert(`Sessão criada! PIN: ${data.pin}`);
        loadSession(); // Reload to get full session data
      } else {
        const errorData = await response.text();
        console.error('Create session error:', errorData);
        setError(`Erro ao criar sessão: ${errorData}`);
      }
    } catch (err) {
      console.error('Create session exception:', err);
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const createRound = async () => {
    if (!session) {
      setError('Crie uma sessão primeiro');
      return;
    }
    if (!newPrompt.trim()) {
      setError('Digite um prompt');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: newPrompt,
          maxTokens,
          temperature,
          deadlineMs,
          seed: Math.floor(Math.random() * 1000000)
        })
      });
      if (response.ok) {
        const data = await response.json();
        setRounds([...rounds, data]);
        setNewPrompt('');
        alert(`Rodada ${data.index} criada com sucesso!`);
        loadSession(); // Refresh to get updated rounds list
      } else {
        const errorText = await response.text();
        setError(`Erro ao criar rodada: ${errorText}`);
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const startRound = async (roundId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/rounds/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId })
      });
      if (response.ok) {
        alert('Rodada iniciada!');
        loadSession();
      } else {
        setError('Erro ao iniciar rodada');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const stopRound = async (roundId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/rounds/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId })
      });
      if (response.ok) {
        alert('Rodada parada!');
        loadSession();
      } else {
        setError('Erro ao parar rodada');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Admin Panel - Gambiarra Club</h1>

        {error && (
          <div className="bg-red-600 text-white p-4 rounded mb-4">
            {error}
          </div>
        )}

        {/* Session Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">Sessão Ativa</h2>
          {session ? (
            <div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-400 mb-1">PIN da Sessão</p>
                  {sessionPin ? (
                    <p className="text-green-400 text-4xl font-mono font-bold">{sessionPin}</p>
                  ) : (
                    <div>
                      <p className="text-yellow-400 text-sm mb-2">⚠️ PIN não disponível (sessão criada antes)</p>
                      <button
                        onClick={createSession}
                        disabled={loading}
                        className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded text-sm font-bold disabled:opacity-50"
                      >
                        Criar Nova Sessão para ver PIN
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-400 mb-1">Session ID</p>
                  <p className="text-gray-300 text-sm font-mono break-all">{session.id}</p>
                  <p className="text-sm text-gray-400 mt-2">Status: <span className="text-green-400">{session.status}</span></p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-700 rounded">
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{rounds.length}</p>
                  <p className="text-sm text-gray-400">Rodadas Criadas</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-400">{rounds.filter(r => getRoundStatus(r) === 'active').length}</p>
                  <p className="text-sm text-gray-400">Em Andamento</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-400">{rounds.filter(r => getRoundStatus(r) === 'completed').length}</p>
                  <p className="text-sm text-gray-400">Concluídas</p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-4">Nenhuma sessão ativa</p>
              <button
                onClick={createSession}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded font-bold disabled:opacity-50"
              >
                Criar Nova Sessão
              </button>
            </div>
          )}
        </div>

        {/* Create Round Section */}
        {session && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Criar Nova Rodada</h2>
            <div className="space-y-4">
              <div>
                <label className="block mb-2">Prompt:</label>
                <textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  className="w-full bg-gray-700 text-white p-3 rounded"
                  rows={4}
                  placeholder="Digite o desafio para os participantes..."
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-sm text-gray-400">Sugestões:</span>
                  {promptTemplates.map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => setNewPrompt(template)}
                      className="text-xs bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded"
                    >
                      {template.substring(0, 30)}...
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block mb-2">Max Tokens:</label>
                  <input
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                    className="w-full bg-gray-700 text-white p-2 rounded"
                  />
                </div>
                <div>
                  <label className="block mb-2">Temperature:</label>
                  <input
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full bg-gray-700 text-white p-2 rounded"
                  />
                </div>
                <div>
                  <label className="block mb-2">Deadline (ms):</label>
                  <input
                    type="number"
                    value={deadlineMs}
                    onChange={(e) => setDeadlineMs(Number(e.target.value))}
                    className="w-full bg-gray-700 text-white p-2 rounded"
                  />
                </div>
              </div>
              <button
                onClick={createRound}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded font-bold disabled:opacity-50"
              >
                Criar Rodada
              </button>
            </div>
          </div>
        )}

        {/* Rounds List */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Rodadas</h2>
            {session && (
              <button
                onClick={loadRounds}
                disabled={loading}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-sm font-bold disabled:opacity-50"
              >
                🔄 Recarregar
              </button>
            )}
          </div>
          {rounds.length === 0 ? (
            <p className="text-gray-400">Nenhuma rodada criada ainda</p>
          ) : (
            <div className="space-y-4">
              {rounds
                .sort((a, b) => b.index - a.index) // Most recent first
                .map((round) => {
                const status = getRoundStatus(round);
                return (
                <div key={round.id} className="bg-gray-700 p-4 rounded">
                  <div className="mb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm text-gray-400">Rodada #{round.index} - ID: {round.id}</p>
                        <p className="font-bold text-lg mt-1">{round.prompt}</p>
                      </div>
                      <span className={`px-3 py-1 rounded text-xs font-bold ${
                        status === 'active' ? 'bg-green-600' :
                        status === 'pending' ? 'bg-yellow-600' :
                        'bg-gray-600'
                      }`}>{status.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm mb-3">
                    <p><strong>Tokens:</strong> {round.maxTokens}</p>
                    <p><strong>Temp:</strong> {round.temperature}</p>
                    <p><strong>Deadline:</strong> {(round.deadlineMs / 1000).toFixed(0)}s</p>
                    <p><strong>Index:</strong> {round.index}</p>
                  </div>
                  {round.startedAt && (
                    <div className="text-xs text-gray-400 mb-3">
                      <p>Iniciada: {new Date(round.startedAt).toLocaleString('pt-BR')}</p>
                      {round.endedAt && (
                        <p>Finalizada: {new Date(round.endedAt).toLocaleString('pt-BR')}</p>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    {status === 'pending' && (
                      <button
                        onClick={() => startRound(round.id)}
                        disabled={loading}
                        className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm font-bold disabled:opacity-50"
                      >
                        ▶️ Iniciar Rodada
                      </button>
                    )}
                    {status === 'active' && (
                      <button
                        onClick={() => stopRound(round.id)}
                        disabled={loading}
                        className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm font-bold disabled:opacity-50"
                      >
                        ⏹️ Parar Rodada
                      </button>
                    )}
                    {status === 'completed' && (
                      <span className="text-green-400 px-4 py-2 text-sm">✅ Concluída</span>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>

        <div className="mt-6">
          <a href="/" className="text-blue-400 hover:text-blue-300">← Voltar para o Telão</a>
        </div>
      </div>
    </div>
  );
}
