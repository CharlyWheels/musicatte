import { Outlet, useLocation } from 'react-router-dom'

import Navbar from './Navbar'

/**
 * The editor needs the width; reading pages want a comfortable measure.
 */
const WIDE_ROUTES = [/^\/editor/, /^\/partitura\//]

export default function Layout() {
  const { pathname } = useLocation()
  const wide = WIDE_ROUTES.some((pattern) => pattern.test(pathname))

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar />
      <main
        className={`mx-auto px-4 pb-28 pt-6 md:pb-8 ${wide ? 'max-w-[100rem]' : 'max-w-6xl'}`}
      >
        <Outlet />
      </main>
    </div>
  )
}
