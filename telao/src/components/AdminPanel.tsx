import { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './Toast';

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
  svgMode: boolean;
  startedAt: string | null;
  endedAt: string | null;
  votingStatus: 'closed' | 'open' | 'revealed';
  revealedCount: number;
  createdAt?: string;
}

interface Participant {
  id: string;
  nickname: string;
  connected: boolean;
  runner: string;
  model: string;
  lastSeen: string;
}

export function AdminPanel() {
  const toast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionPin, setSessionPin] = useState<string | null>(null);

  // Form states
  const [newPrompt, setNewPrompt] = useState('');
  const [maxTokens, setMaxTokens] = useState(500);
  const [temperature, setTemperature] = useState(0.7);
  const [deadlineMs, setDeadlineMs] = useState(120000);
  const [svgMode, setSvgMode] = useState(false);

  // Predefined prompt templates
  const promptTemplates = [
    'Crie o SVG de uma capivara dançando frevo',
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
    // Auto-refresh participants every 5 seconds
    const interval = setInterval(() => {
      loadRounds();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSession = async () => {
    try {
      const response = await fetch(`${API_BASE}/session`);
      if (response.ok) {
        const data = await response.json();
        setSession(data);
        // PIN now comes from the server, not localStorage
        if (data.pin) {
          setSessionPin(data.pin);
        }
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
        setParticipants(data.participants || []);
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
        toast.success(`Sessão criada! PIN: ${data.pin}`);
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
          seed: Math.floor(Math.random() * 1000000),
          svgMode
        })
      });
      if (response.ok) {
        const data = await response.json();
        setRounds([...rounds, data]);
        setNewPrompt('');
        toast.success(`Rodada ${data.index} criada com sucesso!`);
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
        toast.success('Rodada iniciada!');
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
        toast.success('Rodada parada! Votação aberta automaticamente.');
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

  const closeVoting = async (roundId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/rounds/${roundId}/close-voting`, {
        method: 'POST',
      });
      if (response.ok) {
        toast.success('Votação encerrada!');
        loadSession();
      } else {
        const data = await response.json();
        setError(data.error || 'Erro ao fechar votação');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const startReveal = async (roundId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/rounds/${roundId}/reveal`, {
        method: 'POST',
      });
      if (response.ok) {
        toast.success('Premiação iniciada! Use o Scoreboard para ver.');
        loadSession();
      } else {
        const data = await response.json();
        setError(data.error || 'Erro ao iniciar premiação');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const revealNext = async (roundId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/rounds/${roundId}/reveal-next`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Posição revelada! (${data.revealedCount} de ${participants.length})`);
        loadSession();
      } else {
        const data = await response.json();
        setError(data.error || 'Erro ao revelar próximo');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
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
                  <p className="text-green-400 text-4xl font-mono font-bold">{sessionPin || '------'}</p>
                  <button
                    onClick={createSession}
                    disabled={loading}
                    className="mt-2 bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded text-xs font-bold disabled:opacity-50"
                  >
                    🔄 Nova Sessão
                  </button>
                </div>
                <div>
                  <p className="text-sm text-gray-400 mb-1">Session ID</p>
                  <p className="text-gray-300 text-sm font-mono break-all">{session.id}</p>
                  <p className="text-sm text-gray-400 mt-2">Status: <span className="text-green-400">{session.status}</span></p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 p-4 bg-gray-700 rounded mb-4">
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
                <div className="text-center">
                  <p className="text-3xl font-bold text-cyan-400">{participants.filter(p => p.connected).length}</p>
                  <p className="text-sm text-gray-400">Conectados</p>
                </div>
              </div>

              {/* Connected Participants */}
              {participants.length > 0 && (
                <div className="bg-gray-700/50 rounded p-4">
                  <h3 className="text-sm font-bold text-gray-400 mb-3">
                    Participantes ({participants.filter(p => p.connected).length} online / {participants.length} total)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {participants.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center gap-2 p-2 rounded text-sm ${
                          p.connected ? 'bg-green-900/30 border border-green-700' : 'bg-gray-800/50 border border-gray-700'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${p.connected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold truncate ${p.connected ? 'text-white' : 'text-gray-500'}`}>
                            {p.nickname}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{p.runner}/{p.model}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

        {/* Warning: No participants connected */}
        {session && participants.filter(p => p.connected).length === 0 && (
          <div className="bg-red-900/30 border border-red-600 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="font-bold text-red-400">Nenhum participante conectado</h3>
                <p className="text-sm text-gray-400">
                  Participantes precisam conectar usando o PIN <span className="font-mono font-bold text-green-400">{sessionPin}</span> antes de iniciar uma rodada.
                </p>
              </div>
            </div>
          </div>
        )}

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
                  {promptTemplates.map((template, idx) => {
                    const isSvgTemplate = template.toLowerCase().includes('svg');
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setNewPrompt(template);
                          if (isSvgTemplate) {
                            setSvgMode(true);
                          }
                        }}
                        className={`text-xs px-2 py-1 rounded ${
                          isSvgTemplate
                            ? 'bg-primary/20 border border-primary text-primary hover:bg-primary/30'
                            : 'bg-gray-600 hover:bg-gray-500'
                        }`}
                      >
                        {isSvgTemplate && '🎨 '}
                        {template.substring(0, 30)}...
                      </button>
                    );
                  })}
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
              <div className="flex items-center gap-3 p-4 bg-gray-700 rounded">
                <input
                  type="checkbox"
                  id="svgMode"
                  checked={svgMode}
                  onChange={(e) => setSvgMode(e.target.checked)}
                  className="w-5 h-5 accent-primary cursor-pointer"
                />
                <label htmlFor="svgMode" className="cursor-pointer">
                  <span className="font-bold text-primary">SVG Mode</span>
                  <p className="text-sm text-gray-400 mt-1">
                    Quando ativado, o telão renderizará SVGs ao invés de texto puro. Use para desafios de criação de imagens SVG.
                  </p>
                </label>
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
                  {round.svgMode && (
                    <div className="mb-3 px-3 py-2 bg-primary/20 border border-primary rounded">
                      <span className="text-primary font-bold text-sm">🎨 SVG Mode Ativo</span>
                    </div>
                  )}
                  {round.startedAt && (
                    <div className="text-xs text-gray-400 mb-3">
                      <p>Iniciada: {new Date(round.startedAt).toLocaleString('pt-BR')}</p>
                      {round.endedAt && (
                        <p>Finalizada: {new Date(round.endedAt).toLocaleString('pt-BR')}</p>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
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
                      <>
                        {/* Voting status badge */}
                        <span className={`px-3 py-2 rounded text-xs font-bold ${
                          round.votingStatus === 'open' ? 'bg-yellow-600' :
                          round.votingStatus === 'revealed' ? 'bg-purple-600' :
                          'bg-gray-600'
                        }`}>
                          {round.votingStatus === 'open' ? '🗳️ Votação Aberta' :
                           round.votingStatus === 'revealed' ? '🏆 Premiação' :
                           '✅ Votação Fechada'}
                        </span>

                        {/* Close voting button */}
                        {round.votingStatus === 'open' && (
                          <button
                            onClick={() => closeVoting(round.id)}
                            disabled={loading}
                            className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded text-sm font-bold disabled:opacity-50"
                          >
                            🔒 Fechar Votação
                          </button>
                        )}

                        {/* Start reveal button */}
                        {round.votingStatus === 'closed' && (
                          <button
                            onClick={() => startReveal(round.id)}
                            disabled={loading}
                            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm font-bold disabled:opacity-50"
                          >
                            🏆 Iniciar Premiação
                          </button>
                        )}

                        {/* Reveal controls */}
                        {round.votingStatus === 'revealed' && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">
                              Revelados: {round.revealedCount}/{participants.length}
                            </span>
                            <button
                              onClick={() => revealNext(round.id)}
                              disabled={loading || round.revealedCount >= participants.length}
                              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm font-bold disabled:opacity-50"
                            >
                              🎉 Revelar Próximo
                            </button>
                            {round.revealedCount >= participants.length && (
                              <span className="text-green-400 text-sm">✅ Todos revelados!</span>
                            )}
                          </div>
                        )}

                        {/* View scoreboard link */}
                        <a
                          href="/scoreboard"
                          target="_blank"
                          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-bold"
                        >
                          📊 Ver Placar
                        </a>
                      </>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>

        {/* Export Section */}
        {session && (
          <div className="bg-gray-800 rounded-lg p-6 mt-6">
            <h2 className="text-2xl font-bold mb-4">📊 Exportar Dados para Pesquisa</h2>
            <p className="text-gray-400 mb-4">
              Exporte os dados da sessão atual para análise e artigos científicos.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <a
                href={`${API_BASE}/export.csv`}
                download
                className="flex flex-col items-center p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <span className="text-3xl mb-2">📈</span>
                <span className="font-bold">Métricas (CSV)</span>
                <span className="text-xs text-gray-400 mt-1 text-center">
                  Tokens, latência, TPS por participante/rodada
                </span>
              </a>
              <a
                href={`${API_BASE}/export-events.csv`}
                download
                className="flex flex-col items-center p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <span className="text-3xl mb-2">📋</span>
                <span className="font-bold">Eventos (CSV)</span>
                <span className="text-xs text-gray-400 mt-1 text-center">
                  Timeline de todos os eventos da sessão
                </span>
              </a>
              <a
                href={`${API_BASE}/export-all.json`}
                download
                className="flex flex-col items-center p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <span className="text-3xl mb-2">🗂️</span>
                <span className="font-bold">Completo (JSON)</span>
                <span className="text-xs text-gray-400 mt-1 text-center">
                  Todos os dados: participantes, rodadas, votos, eventos
                </span>
              </a>
            </div>
            <div className="mt-4 p-3 bg-gray-700/50 rounded text-sm text-gray-400">
              <strong>Dados incluídos:</strong> Timestamps de geração (início, primeiro token, fim),
              ordem e tempo de resposta dos votos, user-agent dos votantes, log completo de eventos.
            </div>
          </div>
        )}

        <div className="mt-6">
          <a href="/" className="text-blue-400 hover:text-blue-300">← Voltar para o Telão</a>
        </div>
      </div>
    </div>
  );
}
