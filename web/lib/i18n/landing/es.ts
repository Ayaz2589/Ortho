import type { LandingCatalog, LandingCopy } from './index'

const base = {
  metaTitle: 'Ortho — las finanzas del hogar, en orden.',
  metaDescription:
    'Mira en qué gasta tu hogar, reparte lo que comparten y planifica el mes que viene. Una app de dinero tranquila y clara, en tu idioma.',
  notFoundLine: 'No encontramos esa página.',
  notFoundCta: 'Ir a Ortho',
}

// --- spec 046 landing copy — insert only between these markers ---
const landing: LandingCopy = {
  headline: 'Las finanzas del hogar, en orden.',
  subhead:
    'Un lugar tranquilo para que tu hogar vea en qué gasta, reparta lo que comparte y planifique lo que viene.',
  points: [
    {
      title: 'Mira a dónde va el dinero',
      body: 'Todos los gastos en un solo lugar, agrupados por día y por categoría, sin llevar una hoja de cálculo.',
    },
    {
      title: 'Reparte lo que comparten',
      body: 'Alquiler, compras, suscripciones. Divide los gastos comunes entre las personas de tu hogar y deja clara la parte de cada una.',
    },
    {
      title: 'Planifica el mes que viene',
      body: 'Presupuestos, metas de ahorro y gastos de vivienda en una sola vista, para saber cuánto queda antes de gastar.',
    },
  ],
  primaryCta: 'Ver cómo funciona',
  secondaryPrompt: '¿Ya tienes una cuenta?',
  // Matches lib/i18n/es.ts, so the funnel and the app never disagree.
  secondaryCta: 'Iniciar sesión',
}
// --- end spec 046 ---

// --- spec 047 tour copy — insert only between these markers ---
// --- end spec 047 ---

const es: LandingCatalog = { ...base, landing }

export default es
