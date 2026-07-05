import { DragEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

// Kanban com drag & drop nativo do HTML5 (sem dependências).
// Cada movimentação é registrada no histórico do lead pelo back-end.
export default function Kanban() {
  const [etapas, setEtapas] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [erro, setErro] = useState('')

  async function carregar() {
    try {
      const [es, ls] = await Promise.all([api('etapas'), api('leads')])
      setEtapas(es)
      setLeads(ls)
    } catch (e: any) {
      setErro(e.message)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  function aoArrastar(e: DragEvent, leadId: string) {
    e.dataTransfer.setData('text/plain', leadId)
  }

  async function aoSoltar(e: DragEvent, etapaId: string) {
    e.preventDefault()
    const leadId = e.dataTransfer.getData('text/plain')
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.etapa_id === etapaId) return
    // Atualização otimista + registro no histórico feito pelo servidor
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, etapa_id: etapaId } : l)))
    try {
      await api(`leads/${leadId}/mover`, { method: 'POST', body: { etapa_id: etapaId } })
    } catch (err: any) {
      setErro(err.message)
      carregar()
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Funil (Kanban)</h2>
      {erro && <div className="erro">{erro}</div>}
      <div className="kanban">
        {etapas.map((etapa) => {
          const daEtapa = leads.filter((l) => l.etapa_id === etapa.id)
          return (
            <div
              key={etapa.id}
              className="kanban-coluna"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => aoSoltar(e, etapa.id)}
            >
              <h4>{etapa.nome} ({daEtapa.length})</h4>
              {daEtapa.map((lead) => (
                <div
                  key={lead.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => aoArrastar(e, lead.id)}
                >
                  <Link to={`/leads/${lead.id}`}>{lead.nome}</Link>
                  <div className="suave">{lead.atendente?.nome ?? 'Sem atendente'}</div>
                  {lead.valor_estimado != null && (
                    <div className="suave">
                      R$ {Number(lead.valor_estimado).toLocaleString('pt-BR')}
                    </div>
                  )}
                  {lead.status_venda !== 'em_negociacao' && (
                    <span className={`tag ${lead.status_venda}`}>{lead.status_venda}</span>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
