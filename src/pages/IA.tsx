import { FormEvent, useEffect, useState } from 'react'
import { api } from '../lib/api'

// Configuração da automação de IA (somente admin).
// A chave da API (ANTHROPIC_API_KEY) fica nas variáveis de ambiente do
// Netlify — nunca aqui e nunca no front-end.
export default function IA() {
  const [config, setConfig] = useState<any>(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    api('ia').then(setConfig).catch((e) => setErro(e.message))
  }, [])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setOk('')
    try {
      await api('ia', {
        method: 'PUT',
        body: {
          ativa: config.ativa,
          responder_automaticamente: config.responder_automaticamente,
          prompt_sistema: config.prompt_sistema,
          mensagem_transferencia: config.mensagem_transferencia,
          modelo: config.modelo,
        },
      })
      setOk('Configuração salva')
    } catch (err: any) {
      setErro(err.message)
    }
  }

  if (!config) return <p className="suave">{erro || 'Carregando…'}</p>

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>IA e Automações</h2>

      {!config.ia_configurada && (
        <div className="card" style={{ borderColor: '#e0b93f', background: '#fdf8ea' }}>
          <strong>IA não configurada.</strong> Defina a variável de ambiente{' '}
          <code>ANTHROPIC_API_KEY</code> no Netlify com uma chave real da Anthropic.
          Sem ela, o atendimento automático e as sugestões de resposta não funcionam.
        </div>
      )}

      <form className="card" onSubmit={salvar}>
        <h3>Atendimento automático no WhatsApp</h3>
        <p className="suave" style={{ marginBottom: 12 }}>
          Fluxo: a IA atende primeiro (leads novos do WhatsApp). Se o cliente pedir um humano,
          se a IA não souber responder ou se ela falhar, o lead é transferido para atendimento
          humano — e a transferência fica registrada no histórico.
        </p>

        <div className="campo">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={config.ativa}
              onChange={(e) => setConfig({ ...config, ativa: e.target.checked })} />
            Automação de IA ativa
          </label>
        </div>
        <div className="campo">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={config.responder_automaticamente}
              onChange={(e) => setConfig({ ...config, responder_automaticamente: e.target.checked })} />
            Responder automaticamente as mensagens recebidas (primeiro atendimento)
          </label>
        </div>
        <div className="campo">
          <label>Instruções para a IA (prompt do sistema)</label>
          <textarea
            rows={6}
            placeholder="Descreva sua empresa, produtos, horário de atendimento e como a IA deve responder…"
            value={config.prompt_sistema ?? ''}
            onChange={(e) => setConfig({ ...config, prompt_sistema: e.target.value })}
          />
        </div>
        <div className="campo">
          <label>Mensagem enviada ao cliente quando transferir para humano</label>
          <input
            value={config.mensagem_transferencia ?? ''}
            onChange={(e) => setConfig({ ...config, mensagem_transferencia: e.target.value })}
          />
        </div>
        <div className="campo" style={{ maxWidth: 320 }}>
          <label>Modelo</label>
          <input value={config.modelo ?? ''} onChange={(e) => setConfig({ ...config, modelo: e.target.value })} />
        </div>

        {erro && <div className="erro">{erro}</div>}
        {ok && <div className="sucesso">{ok}</div>}
        <button className="btn">Salvar</button>
      </form>

      <div className="card">
        <h3>O que a IA faz neste MVP</h3>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Primeiro atendimento automático no WhatsApp (se ativado acima).</li>
          <li>Responde perguntas simples com base nas instruções configuradas.</li>
          <li>Classifica o lead (quente / morno / frio) e identifica a intenção.</li>
          <li>Registra o resumo da conversa no histórico do lead.</li>
          <li>Transfere para humano quando o cliente pede, quando não sabe responder ou em caso de erro.</li>
          <li>Sugere resposta para o atendente na tela de Chat (botão “Sugestão IA”).</li>
        </ul>
      </div>
    </div>
  )
}
