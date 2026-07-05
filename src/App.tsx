import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import Dashboard from './pages/Dashboard'
import Kanban from './pages/Kanban'
import Leads from './pages/Leads'
import LeadDetalhe from './pages/LeadDetalhe'
import Chat from './pages/Chat'
import Disparos from './pages/Disparos'
import IA from './pages/IA'
import Configuracoes from './pages/Configuracoes'

export default function App() {
  const { session, perfil, carregando, sair } = useAuth()

  if (carregando) return <div className="tela-centro">Carregando…</div>

  // Não autenticado: só login e cadastro
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Autenticado mas ainda não aprovado por um administrador
  if (!perfil || perfil.status !== 'aprovado') {
    return (
      <div className="tela-centro">
        <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <h2>Cadastro em análise</h2>
          <p>
            Seu acesso está <strong>pendente de aprovação</strong> por um
            administrador. Tente novamente mais tarde.
          </p>
          <button className="btn" onClick={sair}>Sair</button>
        </div>
      </div>
    )
  }

  const admin = perfil.role === 'admin'

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/kanban" element={<Kanban />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetalhe />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/disparos" element={<Disparos />} />
        {/* Rotas administrativas: o back-end também valida — isto é só UX */}
        <Route path="/ia" element={admin ? <IA /> : <Navigate to="/" replace />} />
        <Route path="/configuracoes" element={admin ? <Configuracoes /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
