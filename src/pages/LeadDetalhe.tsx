import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

const TIPOS_ATIVIDADE = [
  { valor: 'ligacao', rotulo: 'Ligação realizada' },
  { valor: 'mensagem_enviada', rotulo: 'Mensagem enviada' },
  { valor: 'reuniao', rotulo: 'Reunião marcada' },
  { valor: 'retorno_agendado', rotulo: 'Retorno agendado' },
  { valor: 'observacao', rotulo: 'Observação interna' },
]

export default function LeadDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const admin = perfil?.role === 'admin'

  const [lead, setLead] = useState<any>(null)
  const [etapas, setEtapas] = useState<any[]>([])
  const [atendentes, setAtendentes] = useState<any[]>([])
  const [atividades, setAtividades] = useState<any[]>([])
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [novaAtividade, setNovaAtividade] = useState({ tipo: 'ligacao', descricao: '' })
  const [venda, setVenda] = useState({ valor_fechado: '' })

  async function carregar() {
    setErro('')
    try {
      const l = await api(`leads/${id}`)
      setLead(l)
      setVenda({ valor_fechado: l.valor_fechado ?? l.valor_estimado ?? '' })
      setAtividades(await api(`atividades?lead_id=${id}`))
    } catch (e: any) {
      setErro(e.message)
    }
  }

  useEffect(() => {
    carregar()
    api('etapas').then(setEtapas).catch(() => {})
    if (admin) api('users?status=aprovado').then(setAtendentes).catch(() => {})
  }, [id])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setOk('')
    try {
      await api(`leads/${id}`, {
        method: 'PUT',
        body: {
          nome: lead.nome,
          whatsapp: lead.whatsapp,
          email: lead.email,
          origem: lead.origem,
          observacoes: lead.observacoes,
          valor_estimado: lead.valor_estimado ? Number(lead.valor_estimado) : null,
        },
      })
      setOk('Lead salvo')
      carregar()
    } catch (err: any) {
      setErro(err.message)
    }
  }

  async function moverEtapa(etapaId: string) {
    try {
      await api(`leads/${id}/mover`, { method: 'POST', body: { etapa_id: etapaId } })
      carregar()
    } catch (err: any) { setErro(err.message) }
  }

  async function atribuir(atendenteId: string) {
    try {
      await api(`leads/${id}/atribuir`, { method: 'POST', body: { atendente_id: atendenteId } })
      carregar()
    } catch (err: any) { setErro(err.message) }
  }

  async function mudarVenda(status: 'vendido' | 'perdido' | 'em_negociacao') {
    try {
      await api(`leads/${id}/venda`, {
        method: 'POST',
        body: {
          status_venda: status,
          ...(status === 'vendido' && venda.valor_fechado
            ? { valor_fechado: Number(venda.valor_fechado) }
            : {}),
        },
      })
      carregar()
    } catch (err: any) { setErro(err.message) }
  }

  async function registrarAtividade(e: FormEvent) {
    e.preventDefault()
    try {
      await api('atividades', {
        method: 'POST',
        body: { lead_id: id, ...novaAtividade },
      })
      setNovaAtividade({ tipo: 'ligacao', descricao: '' })
      carregar()
    } catch (err: any) { setErro(err.message) }
  }

  async function excluir() {
    if (!confirm('Excluir este lead?')) return
    try {
      await api(`leads/${id}`, { method: 'DELETE' })
      navigate('/leads')
    } catch (err: any) { setErro(err.message) }
  }

  if (!lead) return <p className="suave">{erro || 'Carregando…'}</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>{lead.nome}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {lead.whatsapp && <Link className="btn" to={`/chat?lead=${lead.id}`}>Abrir conversa</Link>}
          {admin && <button className="btn btn-perigo" onClick={excluir}>Excluir</button>}
        </div>
      </div>

      {erro && <div className="erro">{erro}</div>}
      {ok && <div className="sucesso">{ok}</div>}

      <form className="card" onSubmit={salvar}>
        <h3>Dados do lead</h3>
        <div className="linha">
          <div><label>Nome</label><input value={lead.nome ?? ''} onChange={(e) => setLead({ ...lead, nome: e.target.value })} /></div>
          <div><label>WhatsApp</label><input value={lead.whatsapp ?? ''} onChange={(e) => setLead({ ...lead, whatsapp: e.target.value })} /></div>
          <div><label>E-mail</label><input value={lead.email ?? ''} onChange={(e) => setLead({ ...lead, email: e.target.value })} /></div>
          <div><label>Origem</label><input value={lead.origem ?? ''} onChange={(e) => setLead({ ...lead, origem: e.target.value })} /></div>
        </div>
        <div className="linha" style={{ marginTop: 12 }}>
          <div>
            <label>Etapa do funil</label>
            <select value={lead.etapa_id ?? ''} onChange={(e) => moverEtapa(e.target.value)}>
              {etapas.map((et) => <option key={et.id} value={et.id}>{et.nome}</option>)}
            </select>
          </div>
          {admin && (
            <div>
              <label>Atendente responsável</label>
              <select value={lead.atendente_id ?? ''} onChange={(e) => atribuir(e.target.value)}>
                <option value="">—</option>
                {atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
          )}
          <div><label>Valor estimado (R$)</label><input type="number" step="0.01" value={lead.valor_estimado ?? ''} onChange={(e) => setLead({ ...lead, valor_estimado: e.target.value })} /></div>
          <div><label>Cadastrado em</label><input disabled value={new Date(lead.created_at).toLocaleString('pt-BR')} /></div>
        </div>
        <div className="campo" style={{ marginTop: 12 }}>
          <label>Observações</label>
          <textarea value={lead.observacoes ?? ''} onChange={(e) => setLead({ ...lead, observacoes: e.target.value })} />
        </div>
        <button className="btn">Salvar alterações</button>
      </form>

      <div className="card">
        <h3>Venda</h3>
        <p style={{ marginBottom: 8 }}>
          Status atual: <span className={`tag ${lead.status_venda}`}>{lead.status_venda.replace('_', ' ')}</span>
          {lead.data_fechamento && <span className="suave"> — fechada em {new Date(lead.data_fechamento + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
        </p>
        <div className="linha">
          <div>
            <label>Valor fechado (R$)</label>
            <input type="number" step="0.01" value={venda.valor_fechado} onChange={(e) => setVenda({ valor_fechado: e.target.value })} />
          </div>
          <div style={{ flex: '0 0 auto', display: 'flex', gap: 8 }}>
            <button className="btn" type="button" onClick={() => mudarVenda('vendido')}>Marcar como vendido</button>
            <button className="btn btn-perigo" type="button" onClick={() => mudarVenda('perdido')}>Marcar como perdido</button>
            {lead.status_venda !== 'em_negociacao' && (
              <button className="btn btn-secundario" type="button" onClick={() => mudarVenda('em_negociacao')}>Reabrir negociação</button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Registrar atividade</h3>
        <form onSubmit={registrarAtividade}>
          <div className="linha">
            <div>
              <label>Tipo</label>
              <select value={novaAtividade.tipo} onChange={(e) => setNovaAtividade({ ...novaAtividade, tipo: e.target.value })}>
                {TIPOS_ATIVIDADE.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select>
            </div>
            <div style={{ flex: 3 }}>
              <label>Descrição</label>
              <input value={novaAtividade.descricao} onChange={(e) => setNovaAtividade({ ...novaAtividade, descricao: e.target.value })} />
            </div>
            <div style={{ flex: '0 0 auto' }}><button className="btn">Registrar</button></div>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Histórico</h3>
        <table>
          <thead><tr><th>Data e hora</th><th>Usuário</th><th>Tipo</th><th>Descrição</th></tr></thead>
          <tbody>
            {atividades.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.created_at).toLocaleString('pt-BR')}</td>
                <td>{a.usuario?.nome ?? 'Sistema'}</td>
                <td><span className="tag">{a.tipo.replace(/_/g, ' ')}</span></td>
                <td>{a.descricao ?? '—'}</td>
              </tr>
            ))}
            {atividades.length === 0 && <tr><td colSpan={4} className="suave">Sem atividades ainda</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
