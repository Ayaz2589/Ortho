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
export const esTour = {
  screens: [
    {
      title: 'Todo lo que gastas, en un solo lugar',
      body: 'Añade lo que gastas y marca lo que es compartido. Ortho calcula la parte de cada persona, para que nadie tenga que llevar la cuenta de memoria.',
    },
    {
      title: 'Planifica el mes antes de que llegue',
      body: 'Fija un presupuesto por categoría y aparta dinero para lo que viene. Ortho sigue el ritmo y te muestra lo que queda por planificar.',
    },
    {
      title: 'Una lectura serena de cómo estás',
      body: 'Responde unas preguntas y Ortho te da una puntuación que reúne tus ingresos y gastos, tus ahorros y tus compromisos, con un siguiente paso, nunca una alarma.',
    },
    {
      title: 'Ortho nota lo que se repite',
      body: 'Suscripciones, alquiler, la misma tienda cada semana: los cargos recurrentes se detectan por ti. Confirma los que son reales y Ortho les sigue la pista.',
    },
    {
      title: 'Tuyo, y de tu hogar',
      body: 'Ortho habla seis idiomas, y tus cifras solo las ven las personas con las que compartes hogar.',
    },
  ],
  next: 'Siguiente',
  back: 'Atrás',
  skip: 'Omitir',
  finish: 'Empezar',
  position: '{0} de {1}',
  regionLabel: 'Qué hace Ortho',
}
// --- end spec 047 ---

const es: LandingCatalog = { ...base, landing }

export default es
