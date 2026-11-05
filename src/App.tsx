import { useEffect, useState } from 'react'
import { StoreProvider } from './store'
import { Sidebar } from './components/Sidebar'
import { Overview } from './pages/Overview'
import { ProviderDetail } from './pages/ProviderDetail'
import { AddProviderModal } from './components/AddProviderModal'
import { AddMachineModal } from './components/AddMachineModal'

type Route = { page: 'home' } | { page: 'provider'; id: string }

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (hash.startsWith('p/')) {
    return { page: 'provider', id: decodeURIComponent(hash.slice(2)) }
  }
  return { page: 'home' }
}

function PanelShell() {
  const [route, setRoute] = useState<Route>(parseHash)
  const [addOpen, setAddOpen] = useState(false)
  const [machineOpen, setMachineOpen] = useState(false)

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return (
    <div className="app-shell">
      <Sidebar onAdd={() => setAddOpen(true)} />
      <main className="main">
        {route.page === 'provider' ? (
          <ProviderDetail
            id={route.id}
            onAddMachine={() => setMachineOpen(true)}
          />
        ) : (
          <Overview
            onAdd={() => setAddOpen(true)}
            onAddMachine={() => setMachineOpen(true)}
          />
        )}
      </main>

      {addOpen && (
        <AddProviderModal
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            setAddOpen(false)
            window.location.hash = `#/p/${id}`
          }}
        />
      )}

      {machineOpen && (
        <AddMachineModal
          onClose={() => setMachineOpen(false)}
          onCreated={() => setMachineOpen(false)}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <PanelShell />
    </StoreProvider>
  )
}
