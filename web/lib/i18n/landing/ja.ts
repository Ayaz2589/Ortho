import type { LandingCatalog, LandingCopy } from './index'

const base = {
  metaTitle: 'Ortho — 家計を、整える。',
  metaDescription:
    '世帯の支出を見て、分担する費用を分け、来月の計画を立てる。落ち着いた、わかりやすいお金のアプリを、あなたの言語で。',
  notFoundLine: 'そのページは見つかりませんでした。',
  notFoundCta: 'Ortho へ',
}

// --- spec 046 landing copy — insert only between these markers ---
const landing: LandingCopy = {
  headline: '家計を、整える。',
  subhead:
    '世帯の支出を見て、分担する費用を分け、次に来ることを計画する。そのための落ち着いた場所です。',
  points: [
    {
      title: 'お金の行き先がわかる',
      body: 'すべての支出をひとつの場所に、日付とカテゴリごとにまとめて。表計算ソフトを管理し続ける必要はありません。',
    },
    {
      title: '分担する費用を分ける',
      body: '家賃、食費、サブスクリプション。世帯のメンバーで共有の費用を分け、それぞれの負担をはっきりさせます。',
    },
    {
      title: '来月の計画を立てる',
      body: '予算、貯蓄の目標、住居費をひとつの画面に。使う前に、いくら残っているかがわかります。',
    },
  ],
  primaryCta: '使い方を見る',
  secondaryPrompt: 'すでにアカウントをお持ちですか？',
  // Matches lib/i18n/ja.ts, so the funnel and the app never disagree.
  secondaryCta: 'サインイン',
}
// --- end spec 046 ---

// --- spec 047 tour copy — insert only between these markers ---
// --- end spec 047 ---

const ja: LandingCatalog = { ...base, landing }

export default ja
