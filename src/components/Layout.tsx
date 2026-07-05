import { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Layout({ children }: { children: ReactNode }) {
  const { perfil, sair } = useAuth()
  const admin = perfil?.role === 'admin'

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="logo">CRM Cortez</h1>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/kanban">Kanban</NavLink>
          <NavLink to="/leads">Leads</NavLink>
          <NavLink to="/chat">Chat WhatsApp</NavLink>
          <NavLink to="/disparos">Disparos</NavLink>
          {admin && <NavLink to="/ia">IA e Automações</NavLink>}
          {admin && <NavLink to="/configuracoes">Configurações</NavLink>}
        </nav>
        <div className="sidebar-rodape">
          <div className="usuario">
            <strong>{perfil?.nome}</strong>
            <span>{admin ? 'Administrador' : 'Atendente'}</span>
          </div>
          <button className="btn btn-secundario" onClick={sair}>Sair</button>
        </div>
      </aside>
      <main className="conteudo">{children}</main>
    </div>
  )
}
