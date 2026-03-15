import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-8">
        <Outlet />
      </main>
    </div>
  )
}
