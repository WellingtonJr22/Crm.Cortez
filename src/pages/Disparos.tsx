import { FormEvent, useEffect, useState } from 'react'
import { api } from '../lib/api'

// Disparo de mensagens pela API OFICIAL da Meta.
// Regra da Meta (não burlamos): mensagem ativa fora da janela de 24h
// exige TEMPLATE APROVADO no gerenciador do WhatsApp Business.
export default function Disparos() {
  const [leads, setLeads] = useState<any[]>([])
  const [etapas, setEtapas] = useState<any[]>([])
  const [historico, setHistorico] = useState<any[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<'texto' | 'template'>('texto')
  const [mensagem, setMensagem] = useState('')
  const [template, setTemplate] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function carregar() {
    try {
      const [ls, es, hs] = await Promise.all([api('leads'), api('etapas'), api('disparos')])
      setLeads(ls.filter((l: any) => l.whatsapp))
      setEtapas(es)
      setHistorico(hs)
    } catch (e: any) {
      setErro(e.message)
    }
  }

  useEffect(() => { carregar() }, [])

  const visiveis = leads.filter(
    (l) =>
      (!filtroEtapa || l.etapa_id === filtroEtapa) &&
      (!busca || l.nome.toLowerCase().includes(busca.toLowerCase()))
  )

  function alternar(id: string) {
    setSelecionados((s) => {
      const novo = new Set(s)
      novo.has(id) ? novo.delete(id) : novo.add(id)
      return novo
    })
  }

  function alternarTodos() {
    setSelecionados((s) =>
      s.size === visiveis.length ? new Set() : new Set(visiveis.map((l) => l.id))
    )
  }

  async function disparar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setOk('')
    setEnviando(true)
    try {
      const r = await api('disparos', {
        method: 'POST',
        body: {
          lead_ids: Array.from(selecionados),
          ...(modo === 'texto' ? { mensagem } : { template_nome: template }),
        },
      })
      setOk(`Disparo concluído: ${r.enviados} enviados, ${r.falhas} falhas de ${r.total}`)
      setSelecionados(new Set())
      setMensagem(''); setTemplate('')
      carregar()
    } catch (err: any) {
      setErro(err.message)
    }
    setEnviando(false)
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Disparo de mensagens</h2>
      <p className="suave" style={{ marginBottom: 16 }}>
        Envio pela API oficial da Meta. Texto livre só é entregue a quem falou com você
        nas últimas 24h; fora da janela, use um template aprovado. Limite do MVP: 50 leads por disparo.
      </p>

      {erro && <div className="erro">{erro}</div>}
      {ok && <div className="sucesso">{ok}</div>}

      <div className="card">
        <h3>1. Escolha os leads ({selecionados.size} selecionados)</h3>
        <div className="linha" style={{ marginBottom: 12 }}>
          <div><label>Buscar</label><input value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <div>
            <label>Etapa</label>
            <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
              <option value="">Todas</option>
              {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <button className="btn btn-secundario" type="button" onClick={alternarTodos}>
              Selecionar todos visíveis
            </button>
          </div>
        </div>
        <table>
          <thead><tr><th></th><th>Nome</th><th>WhatsApp</th><th>Etapa</th></tr></thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id}>
                <td><input type="checkbox" style={{ width: 'auto' }} checked={selecionados.has(l.id)} onChange={() => alternar(l.id)} /></td>
                <td>{l.nome}</td>
                <td>{l.whatsapp}</td>
                <td>{l.etapa?.nome ?? '—'}</td>
              </tr>
            ))}
            {visiveis.length === 0 && <tr><td colSpan={4} className="suave">Nenhum lead com WhatsApp</td></tr>}
          </tbody>
        </table>
      </div>

      <form className="card" onSubmit={disparar}>
        <h3>2. Mensagem</h3>
        <div className="abas">
          <button type="button" className={modo === 'texto' ? 'ativa' : ''} onClick={() => setModo('texto')}>Texto livre (janela 24h)</button>
          <button type="button" className={modo === 'template' ? 'ativa' : ''} onClick={() => setModo('template')}>Template aprovado</button>
        </div>
        {modo === 'texto' ? (
          <div className="campo">
            <label>Mensagem</label>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} required />
          </div>
        ) : (
          <div className="campo">
            <label>Nome do template aprovado na Meta (idioma pt_BR)</label>
            <input value={template} onChange={(e) => setTemplate(e.target.value)} required placeholder="ex.: boas_vindas" />
          </div>
        )}
        <button className="btn" disabled={enviando || selecionados.size === 0}>
          {enviando ? 'Enviando…' : `Disparar para ${selecionados.size} lead(s)`}
        </button>
      </form>

      <div className="card">
        <h3>Histórico de disparos</h3>
        <table>
          <thead><tr><th>Data</th><th>Por</th><th>Conteúdo</th><th>Total</th><th>Enviados</th><th>Falhas</th></tr></thead>
          <tbody>
            {historico.map((d) => (
              <tr key={d.id}>
                <td>{new Date(d.created_at).toLocaleString('pt-BR')}</td>
                <td>{d.usuario?.nome ?? '—'}</td>
                <td>{d.template_nome ? `template: ${d.template_nome}` : (d.mensagem ?? '').slice(0, 60)}</td>
                <td>{d.total}</td><td>{d.enviados}</td><td>{d.falhas}</td>
              </tr>
            ))}
            {historico.length === 0 && <tr><td colSpan={6} className="suave">Nenhum disparo ainda</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
