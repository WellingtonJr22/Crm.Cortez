import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

const brl = (v: number) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Dashboard() {
  const { perfil } = useAuth()
  const admin = perfil?.role === 'admin'

  const [dados, setDados] = useState<any>(null)
  const [etapas, setEtapas] = useState<any[]>([])
  const [atendentes, setAtendentes] = useState<any[]>([])
  const [erro, setErro] = useState('')
  const [filtros, setFiltros] = useState({
    de: '', ate: '', atendente_id: '', status_venda: '', etapa_id: '', origem: '',
  })

  function setF(campo: string, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
  }

  async function carregar() {
    setErro('')
    try {
      const qs = new URLSearchParams(
        Object.entries(filtros).filter(([, v]) => v !== '')
      ).toString()
      setDados(await api(`dashboard${qs ? `?${qs}` : ''}`))
    } catch (e: any) {
      setErro(e.message)
    }
  }

  useEffect(() => {
    carregar()
    api('etapas').then(setEtapas).catch(() => {})
    if (admin) api('users?status=aprovado').then(setAtendentes).catch(() => {})
  }, [])

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Dashboard</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="linha">
          <div><label>De</label><input type="date" value={filtros.de} onChange={(e) => setF('de', e.target.value)} /></div>
          <div><label>Até</label><input type="date" value={filtros.ate} onChange={(e) => setF('ate', e.target.value)} /></div>
          {admin && (
            <div>
              <label>Atendente</label>
              <select value={filtros.atendente_id} onChange={(e) => setF('atendente_id', e.target.value)}>
                <option value="">Todos</option>
                {atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
          )}
          <div>
            <label>Status da venda</label>
            <select value={filtros.status_venda} onChange={(e) => setF('status_venda', e.target.value)}>
              <option value="">Todos</option>
              <option value="em_negociacao">Em negociação</option>
              <option value="vendido">Vendido</option>
              <option value="perdido">Perdido</option>
            </select>
          </div>
          <div>
            <label>Etapa</label>
            <select value={filtros.etapa_id} onChange={(e) => setF('etapa_id', e.target.value)}>
              <option value="">Todas</option>
              {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
          <div><label>Origem</label><input placeholder="ex.: whatsapp" value={filtros.origem} onChange={(e) => setF('origem', e.target.value)} /></div>
          <div style={{ flex: '0 0 auto' }}><button className="btn" onClick={carregar}>Filtrar</button></div>
        </div>
      </div>

      {erro && <div className="erro">{erro}</div>}
      {!dados ? (
        <p className="suave">Carregando…</p>
      ) : (
        <>
          <div className="cards-grid">
            <Card rotulo="Leads cadastrados" valor={dados.total_leads} />
            <Card rotulo="Clientes (vendidos)" valor={dados.total_clientes} />
            <Card rotulo="Em atendimento" valor={dados.leads_em_atendimento} />
            <Card rotulo="Vendas fechadas" valor={dados.vendas_fechadas} />
            <Card rotulo="Vendas perdidas" valor={dados.vendas_perdidas} />
            <Card rotulo="Valor total vendido" valor={brl(dados.valor_total_vendido)} />
            <Card rotulo="Vendido no mês atual" valor={brl(dados.valor_vendido_mes_atual)} />
            <Card rotulo="Vendido no período" valor={brl(dados.valor_vendido_periodo)} />
          </div>

          <div className="card">
            <h3>Leads por etapa do funil</h3>
            <table>
              <thead><tr><th>Etapa</th><th>Quantidade</th></tr></thead>
              <tbody>
                {dados.leads_por_etapa.map((e: any) => (
                  <tr key={e.etapa_id}><td>{e.nome}</td><td>{e.quantidade}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          {admin && dados.por_atendente && (
            <div className="card">
              <h3>Por atendente</h3>
              <table>
                <thead>
                  <tr><th>Atendente</th><th>Leads</th><th>Vendas</th><th>Valor vendido</th></tr>
                </thead>
                <tbody>
                  {dados.por_atendente.map((a: any) => (
                    <tr key={a.atendente_id}>
                      <td>{a.nome}</td><td>{a.leads}</td><td>{a.vendas}</td><td>{brl(a.valor_vendido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Card({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div className="card-numero">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
    </div>
  )
}
