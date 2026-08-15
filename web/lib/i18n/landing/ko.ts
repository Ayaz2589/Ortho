import type { LandingCatalog, LandingCopy } from './index'

const base = {
  metaTitle: 'Ortho — 가계 재정을 가지런하게.',
  metaDescription:
    '가족의 지출을 한눈에 보고, 함께 쓰는 비용을 나누고, 다음 달을 계획하세요. 차분하고 쉬운 가계부 앱을 당신의 언어로.',
  notFoundLine: '해당 페이지를 찾지 못했습니다.',
  notFoundCta: 'Ortho로 가기',
}

// --- spec 046 landing copy — insert only between these markers ---
const landing: LandingCopy = {
  headline: '가계 재정을 가지런하게.',
  subhead: '가족이 무엇에 쓰는지 보고, 함께 쓰는 비용을 나누고, 다음을 계획하는 차분한 공간입니다.',
  points: [
    {
      title: '돈이 어디로 가는지 봅니다',
      body: '모든 지출을 한곳에, 날짜와 분류별로 정리해서. 따로 스프레드시트를 관리할 필요가 없습니다.',
    },
    {
      title: '함께 쓰는 비용을 나눕니다',
      body: '월세, 장보기, 구독. 가족 구성원끼리 공동 지출을 나누고 각자의 몫을 분명하게 유지합니다.',
    },
    {
      title: '다음 달을 계획합니다',
      body: '예산과 저축 목표, 주거비를 한 화면에서. 쓰기 전에 얼마가 남았는지 알 수 있습니다.',
    },
  ],
  primaryCta: '어떻게 작동하는지 보기',
  secondaryPrompt: '이미 계정이 있으신가요?',
  // Matches lib/i18n/ko.ts, so the funnel and the app never disagree.
  secondaryCta: '로그인',
}
// --- end spec 046 ---

// --- spec 047 tour copy — insert only between these markers ---
// --- end spec 047 ---

const ko: LandingCatalog = { ...base, landing }

export default ko
