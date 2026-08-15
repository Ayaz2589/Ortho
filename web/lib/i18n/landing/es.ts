import type { LandingCatalog } from './index'

const es: LandingCatalog = {
  metaTitle: 'Ortho — las finanzas del hogar, en orden.',
  metaDescription:
    'Una forma tranquila de seguir los gastos, repartir las cuentas y planificar juntos. Hecho para el hogar, en tu idioma.',
  notFoundLine: 'No encontramos esa página.',
  notFoundCta: 'Ir a Ortho',
  placeholderLine: 'Las finanzas del hogar, en orden.',
}

// --- spec 046 landing copy — insert only between these markers ---
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

export default es
