import type { LandingCatalog, LandingCopy } from './index'

const base = {
  metaTitle: 'Ortho — ঘরের হিসাব, গোছানো।',
  metaDescription:
    'আপনার পরিবার কোথায় খরচ করে দেখুন, ভাগের খরচ ভাগ করে নিন, আর সামনের মাসের পরিকল্পনা করুন। শান্ত ও সহজ ভাষার টাকার অ্যাপ, আপনার নিজের ভাষায়।',
  notFoundLine: 'আমরা সেই পাতাটি খুঁজে পাইনি।',
  notFoundCta: 'Ortho-তে যান',
}

// --- spec 046 landing copy — insert only between these markers ---
const landing: LandingCopy = {
  headline: 'ঘরের হিসাব, গোছানো।',
  subhead:
    'আপনার পরিবার কোথায় খরচ করে, কোন খরচ ভাগ করে নেয় আর সামনে কী আসছে — সব দেখার একটি শান্ত জায়গা।',
  points: [
    {
      title: 'টাকা কোথায় যাচ্ছে দেখুন',
      body: 'সব খরচ এক জায়গায়, দিন আর ধরন অনুযায়ী সাজানো — আলাদা কোনো হিসাবের খাতা রাখতে হবে না।',
    },
    {
      title: 'ভাগের খরচ ভাগ করে নিন',
      body: 'বাড়িভাড়া, বাজার, সাবস্ক্রিপশন। পরিবারের সদস্যদের মধ্যে ভাগের খরচ ভাগ করুন, কার কত অংশ তা পরিষ্কার থাকুক।',
    },
    {
      title: 'সামনের মাসের পরিকল্পনা করুন',
      body: 'বাজেট, সঞ্চয়ের লক্ষ্য আর বাড়ির খরচ এক জায়গায় — খরচ করার আগেই জেনে নিন কত বাকি আছে।',
    },
  ],
  primaryCta: 'কীভাবে কাজ করে দেখুন',
  secondaryPrompt: 'আগে থেকেই অ্যাকাউন্ট আছে?',
  // Matches lib/i18n/bn.ts, so the funnel and the app never disagree.
  secondaryCta: 'সাইন ইন',
}
// --- end spec 046 ---

// --- spec 047 tour copy — insert only between these markers ---
// --- end spec 047 ---

const bn: LandingCatalog = { ...base, landing }

export default bn
