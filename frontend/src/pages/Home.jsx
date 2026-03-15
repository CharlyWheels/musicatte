import { Link } from 'react-router-dom'
import { Camera, Music, Library, ArrowRight } from 'lucide-react'

const features = [
  {
    to: '/scanner',
    icon: Camera,
    color: 'bg-amber-100 text-amber-600',
    title: 'Scanner OCR',
    desc: 'Sube una foto de una partitura y conviértela automáticamente a formato digital MusicXML.',
  },
  {
    to: '/editor',
    icon: Music,
    color: 'bg-indigo-100 text-indigo-600',
    title: 'Editor interactivo',
    desc: 'Edita tus partituras con drag & drop. Mueve notas, cambia duraciones y alteraciones fácilmente.',
  },
  {
    to: '/repository',
    icon: Library,
    color: 'bg-emerald-100 text-emerald-600',
    title: 'Repositorio comunitario',
    desc: 'Publica tus partituras, descubre nuevas obras y valora las creaciones de la comunidad.',
  },
]

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="space-y-6 pt-8 text-center md:pt-16">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
          <Music size={32} className="text-indigo-600" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
          Musicatte
        </h1>
        <p className="mx-auto max-w-xl text-lg text-slate-500">
          Digitaliza partituras desde una foto, edítalas con drag & drop y compártelas en un
          repositorio comunitario abierto.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/scanner"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-indigo-700 hover:shadow-lg active:scale-95"
          >
            Empezar ahora
            <ArrowRight size={18} />
          </Link>
          <Link
            to="/repository"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            Explorar repositorio
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-6 md:grid-cols-3">
        {features.map((f) => (
          <Link
            key={f.to}
            to={f.to}
            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
          >
            <div className={`mb-4 inline-flex rounded-xl p-3 ${f.color}`}>
              <f.icon size={24} />
            </div>
            <h2 className="mb-2 text-lg font-bold text-slate-900 group-hover:text-indigo-600">
              {f.title}
            </h2>
            <p className="text-sm leading-relaxed text-slate-500">{f.desc}</p>
          </Link>
        ))}
      </section>

      {/* Tech stack */}
      <section className="text-center">
        <p className="text-xs text-slate-400">
          Powered by Verovio + HOMR OCR + FastAPI + React
        </p>
      </section>
    </div>
  )
}
