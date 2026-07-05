import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function Leads() {
  const { perfil } = useAuth()
  const admin = perfil?.role === 'admin'

  const [leads, setLeads] = useState<any[]>([])
  const [etapas, setEtapas] = useState<any[]>([])
  const [atendentes, setAtendentes] = useState<any[]>([])
  const [erro, setErro] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [filtros, setFiltros] = useState({ busca: '', etapa_id: '', status_venda: '' })
  const [novo, setNovo] = useState({
    nome: '', whatsapp: '', email: '', origem: '', valor_estimado: '', atendente_id: '',
  })

  async function carregar() {
    setErro('')
    try {
      const qs = new URLSearchParams(
        Object.entries(filtros).filter(([, v]) => v !== '')
      ).toString()
      setLeads(await api(`leads${qs ? `?${qs}` : ''}`))
    } catch (e: any) {
      setErro(e.message)
    }
  }

  useEffect(() => {
    carregar()
    api('etapas').then(setEtapas).catch(() => {})
    if (admin) api('users?status=aprovado').then(setAtendentes).catch(() => {})
  }, [])

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    try {
      await api('leads', {
        method: 'POST',
        body: {
          ...novo,
          valor_estimado: novo.valor_estimado ? Number(novo.valor_estimado) : null,
          atendente_id: novo.atendente_id || undefined,
        },
      })
      setNovo({ nome: '', whatsapp: '', email: '', origem: '', valor_estimado: '', atendente_id: '' })
      setMostrarForm(false)
      carregar()
    } catch (err: any) {
      setErro(err.message)
    }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este lead? Essa ação não pode ser desfeita.')) return
    try {
      await api(`leads/${id}`, { method: 'DELETE' })
      carregar()
    } catch (err: any) {
      setErro(err.message)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>Leads</h2>
        <button className="btn" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Fechar' : '+ Novo lead'}
        </button>
      </div>

      {mostrarForm && (
        <form className="card" style={{ marginBottom: 16 }} onSubmit={criar}>
          <h3>Novo lead</h3>
          <div className="linha">
            <div><label>Nome *</label><input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required /></div>
            <div><label>WhatsApp (com DDI, ex.: 5511999998888)</label><input value={novo.whatsapp} onChange={(e) => setNovo({ ...novo, whatsapp: e.target.value })} /></div>
            <div><label>E-mail</label><input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></div>
          </div>
          <div className="linha" style={{ marginTop: 12 }}>
            <div><label>Origem</label><input placeholder="ex.: site, indicação" value={novo.origem} onChange={(e) => setNovo({ ...novo, origem: e.target.value })} /></div>
            <div><label>Valor estimado (R$)</label><input type="number" step="0.01" value={novo.valor_estimado} onChange={(e) => setNovo({ ...novo, valor_estimado: e.target.value })} /></div>
            {admin && (
              <div>
                <label>Atendente responsável</label>
                <select value={novo.atendente_id} onChange={(e) => setNovo({ ...novo, atendente_id: e.target.value })}>
                  <option value="">Eu mesmo</option>
                  {atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
            )}
            <div style={{ flex: '0 0 auto' }}><button className="btn">Salvar</button></div>
          </div>
        </form>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="linha">
          <div><label>Buscar</label><input placeholder="nome, e-mail ou WhatsApp" value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} /></div>
          <div>
            <label>Etapa</label>
            <select value={filtros.etapa_id} onChange={(e) => setFiltros({ ...filtros, etapa_id: e.target.value })}>
              <option value="">Todas</option>
              {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
          <div>
            <label>Status da venda</label>
            <select value={filtros.status_venda} onChange={(e) => setFiltros({ ...filtros, status_venda: e.target.value })}>
              <option value="">Todos</option>
              <option value="em_negociacao">Em negociação</option>
              <option value="vendido">Vendido</option>
              <option value="perdido">Perdido</option>
            </select>
          </div>
          <div style={{ flex: '0 0 auto' }}><button className="btn" onClick={carregar}>Filtrar</button></div>
        </div>
      </div>

      {erro && <div className="erro">{erro}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nome</th><th>WhatsApp</th><th>Etapa</th><th>Atendente</th>
              <th>Status</th><th>Valor</th><th>Cadastro</th><th></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td><Link to={`/leads/${l.id}`}>{l.nome}</Link></td>
                <td>{l.whatsapp ?? '—'}</td>
                <td>{l.etapa?.nome ?? '—'}</td>
                <td>{l.atendente?.nome ?? '—'}</td>
                <td><span className={`tag ${l.status_venda}`}>{l.status_venda.replace('_', ' ')}</span></td>
                <td>
                  {l.status_venda === 'vendido' && l.valor_fechado != null
                    ? `R$ ${Number(l.valor_fechado).toLocaleString('pt-BR')}`
                    : l.valor_estimado != null
                      ? `~R$ ${Number(l.valor_estimado).toLocaleString('pt-BR')}`
                      : '—'}
                </td>
                <td>{new Date(l.created_at).toLocaleDateString('pt-BR')}</td>
                <td>
                  {admin && (
                    <button className="btn btn-perigo btn-mini" onClick={() => excluir(l.id)}>Excluir</button>
                  )}
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr><td colSpan={8} className="suave">Nenhum lead encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
