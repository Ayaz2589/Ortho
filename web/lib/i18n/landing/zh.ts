import type { LandingCatalog } from './index'

const zh: LandingCatalog = {
  metaTitle: 'Ortho — 让家庭财务井然有序。',
  metaDescription: '记录支出、分摊费用、一起规划。为家庭打造的从容记账方式，用你的语言。',
  notFoundLine: '我们找不到该页面。',
  notFoundCta: '前往 Ortho',
  placeholderLine: '让家庭财务井然有序。',
}

// --- spec 046 landing copy — insert only between these markers ---
// --- end spec 046 ---

// --- spec 047 tour copy — insert only between these markers ---
export const zhTour = {
  screens: [
    {
      title: '所有支出，都在一处',
      body: '记下你花的钱，并标记哪些是共同支出。Ortho 会算出每个人该分担多少，不必再在心里记账。',
    },
    {
      title: '在月份开始前就做好计划',
      body: '按类别设定预算，为将要发生的支出预留资金。Ortho 会跟踪进度，告诉你还有多少需要安排。',
    },
    {
      title: '平静地看清自己的处境',
      body: '回答几个问题，Ortho 会给出一个综合收支、储蓄与固定支出的分数，并附上下一步建议，而不是警告。',
    },
    {
      title: '重复发生的，Ortho 会注意到',
      body: '订阅、房租、每周光顾的同一家店——周期性支出会被自动找出。确认真实的那些，Ortho 就会持续记录。',
    },
    {
      title: '属于你，也属于你的家庭',
      body: 'Ortho 支持六种语言，你的数字只有与你共同管理家庭账目的人才能看到。',
    },
  ],
  next: '下一步',
  back: '上一步',
  skip: '跳过',
  finish: '开始使用',
  position: '第 {0} 页，共 {1} 页',
  regionLabel: 'Ortho 能做什么',
}
// --- end spec 047 ---

export default zh
