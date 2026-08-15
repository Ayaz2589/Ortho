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
export const jaTour = {
  screens: [
    {
      title: '支出のすべてを、ひとつの場所に',
      body: '使った金額を記録し、共有するものに印を付けます。Ortho が一人ひとりの負担分を計算するので、頭の中で数え続ける必要はありません。',
    },
    {
      title: '月が始まる前に、計画を',
      body: 'カテゴリごとに予算を決め、これから必要になるお金を取り分けます。Ortho がペースを追い、あと何を計画すればよいかを示します。',
    },
    {
      title: 'いまの状態が、静かにわかる',
      body: 'いくつかの質問に答えると、収支・貯蓄・固定の支払いをまとめた一つのスコアが出ます。警告ではなく、次の一歩が示されます。',
    },
    {
      title: '繰り返しに、Ortho が気づく',
      body: 'サブスク、家賃、毎週通う同じ店。繰り返しの支払いは自動で見つかります。実際のものを確認すれば、Ortho が把握し続けます。',
    },
    {
      title: 'あなたと、あなたの家族のもの',
      body: 'Ortho は六つの言語に対応し、数字を見られるのは同じ家計を共有する人だけです。',
    },
  ],
  next: '次へ',
  back: '戻る',
  skip: 'スキップ',
  finish: 'はじめる',
  position: '{1} 件中 {0} 件目',
  regionLabel: 'Ortho でできること',
}
// --- end spec 047 ---

const ja: LandingCatalog = { ...base, landing }

export default ja
