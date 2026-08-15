import type { LandingCatalog, LandingCopy } from './index'

const base = {
  metaTitle: 'Ortho — 让家庭财务井然有序。',
  metaDescription:
    '看清家庭的每一笔支出，分摊共同的花费，规划下个月。一款从容、直白的记账应用，用你的语言。',
  notFoundLine: '我们找不到该页面。',
  notFoundCta: '前往 Ortho',
}

// --- spec 046 landing copy — insert only between these markers ---
const landing: LandingCopy = {
  headline: '让家庭财务井然有序。',
  subhead: '一个从容的地方，让家里人看清支出、分摊共同的花费，并规划接下来的事。',
  points: [
    {
      title: '看清钱花在哪里',
      body: '所有支出集中在一处，按日期和类别分组，不用再维护表格。',
    },
    {
      title: '分摊共同的花费',
      body: '房租、买菜、订阅服务。在家庭成员之间分摊共同支出，每个人该出多少一目了然。',
    },
    {
      title: '规划下个月',
      body: '预算、储蓄目标和住房支出在同一个视图里，花钱之前就知道还剩多少。',
    },
  ],
  primaryCta: '看看它如何运作',
  secondaryPrompt: '已经有账号了？',
  // Matches lib/i18n/zh.ts, so the funnel and the app never disagree.
  secondaryCta: '登录',
}
// --- end spec 046 ---

// --- spec 047 tour copy — insert only between these markers ---
// --- end spec 047 ---

const zh: LandingCatalog = { ...base, landing }

export default zh
