const CATEGORY_RULES = [
  { category: "관리비", keywords: ["관리비", "관리", "공과금"] },
  { category: "계약서", keywords: ["계약", "계약서", "서명"] },
  { category: "보험", keywords: ["보험", "보험료"] },
  { category: "세금", keywords: ["세금", "부가세", "소득세"] },
];

const TAG_RULES = [
  { tag: "금액", regex: /([0-9][0-9,]*)\s*원/ },
  { tag: "날짜", regex: /\d{4}\.\d{1,2}\.\d{1,2}/ },
  { tag: "계약", regex: /계약/ },
  { tag: "보험", regex: /보험/ },
];

export function autoClassify(text = "") {
  const trimmed = String(text).trim();
  if (!trimmed) {
    return { category: "미분류", tags: [], confidence: 0.1 };
  }

  const hit = CATEGORY_RULES.find((rule) =>
    rule.keywords.some((kw) => trimmed.includes(kw))
  );
  const category = hit ? hit.category : "기타";
  const tags = [];

  for (const rule of TAG_RULES) {
    if (rule.regex.test(trimmed)) tags.push(rule.tag);
  }

  const confidence = hit ? 0.7 : tags.length ? 0.4 : 0.2;
  return { category, tags: Array.from(new Set(tags)), confidence };
}
