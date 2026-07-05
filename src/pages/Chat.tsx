import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'

// Chat vinculado ao lead. As mensagens chegam pelo webhook da API oficial
// da Meta e são atualizadas aqui por polling simples (a cada 8s).
export default function Chat() {
  const [params, setParams] = useSearchParams()
  const leadSelecionado = params.get('lead')

  const [conversas, setConversas] = useState<any[]>([])
  const [mensagens, setMensagens] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [sugestao, setSugestao] = useState('')
  const [carregandoSugestao, setCarregandoSugestao] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  async function carregarConversas() {
    try {
      setConversas(await api('whatsapp/conversas'))
    } catch (e: any) {
      setErro(e.message)
    }
  }

  async function carregarMensagens() {
    if (!leadSelecionado) return
    try {
      setMensagens(await api(`whatsapp?lead_id=${leadSelecionado}`))
    } catch (e: any) {
      setErro(e.message)
    }
  }

  useEffect(() => {
    carregarConversas()
    const timer = setInterval(carregarConversas, 15000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setErro('')
    setSugestao('')
    carregarMensagens()
    const timer = setInterval(carregarMensagens, 8000)
    return () => clearInterval(timer)
  }, [leadSelecionado])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim() || !leadSelecionado) return
    setErro('')
    try {
      await api('whatsapp', { method: 'POST', body: { lead_id: leadSelecionado, texto } })
      setTexto('')
      setSugestao('')
      carregarMensagens()
    } catch (err: any) {
      setErro(err.message)
    }
  }

  async function pedirSugestao() {
    if (!leadSelecionado) return
    setCarregandoSugestao(true)
    setErro('')
    try {
      const r = await api<{ sugestao: string }>('ia/sugerir', {
        method: 'POST',
        body: { lead_id: leadSelecionado },
      })
      setSugestao(r.sugestao)
    } catch (err: any) {
      setErro(err.message)
    }
    setCarregandoSugestao(false)
  }

  const conversaAtual = conversas.find((c) => c.id === leadSelecionado)

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Chat WhatsApp</h2>
      {erro && <div className="erro">{erro}</div>}
      <div className="chat">
        <div className="card chat-lista">
          {conversas.length === 0 && (
            <p className="suave">
              Nenhuma conversa ainda. As conversas aparecem quando chegam mensagens
              pelo webhook da API oficial da Meta.
            </p>
          )}
          {conversas.map((c) => (
            <div
              key={c.id}
              className={`conversa ${c.id === leadSelecionado ? 'ativa' : ''}`}
              onClick={() => setParams({ lead: c.id })}
            >
              <strong>{c.nome}</strong>
              {c.modo_atendimento === 'ia' && <span className="tag" style={{ marginLeft: 6 }}>IA</span>}
              <div className="suave" style={{ fontSize: 12 }}>
                {c.ultima_mensagem?.conteudo?.slice(0, 40) ?? ''}
              </div>
            </div>
          ))}
        </div>

        <div className="card chat-janela">
          {!leadSelecionado ? (
            <p className="suave">Selecione uma conversa ao lado.</p>
          ) : (
            <>
              <div style={{ borderBottom: '1px solid var(--borda)', paddingBottom: 8, marginBottom: 8 }}>
                <strong>{conversaAtual?.nome ?? 'Conversa'}</strong>{' '}
                <Link to={`/leads/${leadSelecionado}`} className="suave">ver lead</Link>
              </div>
              <div className="chat-mensagens">
                {mensagens.map((m) => (
                  <div key={m.id} className={`balao ${m.direcao}`}>
                    {m.conteudo}
                    <span className="meta">
                      {m.origem === 'ia' ? 'IA · ' : m.origem === 'disparo' ? 'Disparo · ' : ''}
                      {new Date(m.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                ))}
                <div ref={fimRef} />
              </div>
              {sugestao && (
                <div className="card" style={{ background: '#f4f9f6', marginBottom: 8 }}>
                  <strong>Sugestão da IA:</strong> {sugestao}{' '}
                  <button className="btn btn-mini" type="button" onClick={() => { setTexto(sugestao); setSugestao('') }}>
                    Usar
                  </button>
                </div>
              )}
              <form className="chat-envio" onSubmit={enviar}>
                <textarea
                  placeholder="Digite a mensagem…"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className="btn" type="submit">Enviar</button>
                  <button className="btn btn-secundario btn-mini" type="button" onClick={pedirSugestao} disabled={carregandoSugestao}>
                    {carregandoSugestao ? '…' : 'Sugestão IA'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
