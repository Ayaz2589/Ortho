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
export const koTour = {
  screens: [
    {
      title: '지출을 한곳에 모아서',
      body: '쓴 돈을 기록하고 함께 쓴 것에 표시해 두세요. Ortho가 각자의 몫을 계산해 주니 머릿속으로 셈을 이어갈 필요가 없습니다.',
    },
    {
      title: '달이 시작되기 전에 계획하기',
      body: '항목별로 예산을 정하고 앞으로 쓸 돈을 미리 떼어 두세요. Ortho가 속도를 따라가며 무엇이 남았는지 알려 줍니다.',
    },
    {
      title: '지금 어디쯤인지 차분하게',
      body: '몇 가지 질문에 답하면 수입과 지출, 저축, 고정 지출을 아우르는 하나의 점수가 나옵니다. 경고등이 아니라 다음 한 걸음이 함께 옵니다.',
    },
    {
      title: '반복되는 것을 Ortho가 알아봅니다',
      body: '구독료, 월세, 매주 가는 같은 가게 — 반복되는 결제를 대신 찾아 줍니다. 맞는 것만 확인해 두면 Ortho가 계속 챙깁니다.',
    },
    {
      title: '당신과, 당신 가족의 것',
      body: 'Ortho는 여섯 개 언어로 쓸 수 있고, 숫자는 가계를 함께 쓰는 사람만 볼 수 있습니다.',
    },
  ],
  next: '다음',
  back: '이전',
  skip: '건너뛰기',
  finish: '시작하기',
  position: '{1} 중 {0}',
  regionLabel: 'Ortho가 하는 일',
}
// --- end spec 047 ---

const ko: LandingCatalog = { ...base, landing }

export default ko
