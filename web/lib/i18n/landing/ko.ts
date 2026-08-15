import type { LandingCatalog } from './index'

const ko: LandingCatalog = {
  metaTitle: 'Ortho — 가계 재정을 가지런하게.',
  metaDescription:
    '지출을 기록하고, 비용을 나누고, 함께 계획하세요. 가정을 위한 차분한 가계부를 당신의 언어로.',
  notFoundLine: '해당 페이지를 찾지 못했습니다.',
  notFoundCta: 'Ortho로 가기',
  placeholderLine: '가계 재정을 가지런하게.',
}

// --- spec 046 landing copy — insert only between these markers ---
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

export default ko
