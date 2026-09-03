import { Link } from 'react-router-dom'
import { ArrowRight, Camera, Library, Music, Pencil } from 'lucide-react'

const STEPS = [
  {
    icon: Camera,
    title: 'Haz la foto',
    text: 'Encaja la hoja, con luz uniforme. Te decimos al momento si la foto sirve, sin esperar a que acabe el reconocimiento.',
  },
  {
    icon: Music,
    title: 'Revisa lo reconocido',
    text: 'Te enseñamos la partitura digitalizada, te señalamos los compases que no cuadran y puedes escucharla para cazar notas mal leídas.',
  },
  {
    icon: Pencil,
    title: 'Corrige y comparte',
    text: 'Edita notas, figuras, ligaduras y dinámicas. Descarga en MusicXML, MIDI o PDF, o publícala en el repositorio.',
  },
]

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="space-y-6 pt-8 text-center md:pt-14">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
          <Music size={32} className="text-indigo-600" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
          Musicatte
        </h1>
        <p className="mx-auto max-w-xl text-lg text-slate-500">
          Digitaliza partituras desde una foto, corrígelas en un editor de verdad y compártelas
          con quien quieras.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/escanear"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-indigo-700 hover:shadow-lg"
          >
            Escanear una partitura <ArrowRight size={18} />
          </Link>
          <Link
            to="/repositorio"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Library size={18} /> Explorar el repositorio
          </Link>
        </div>
      </section>

      <section>
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <step.icon size={20} className="text-indigo-500" />
              </div>
              <h2 className="mb-2 text-lg font-bold text-slate-900">{step.title}</h2>
              <p className="text-sm leading-relaxed text-slate-500">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
