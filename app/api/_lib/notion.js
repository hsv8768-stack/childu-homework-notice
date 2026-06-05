const NOTION_VERSION = "2025-09-03";

export function envReady() {
  return Boolean(
    process.env.NOTION_TOKEN &&
      process.env.NOTION_STUDENTS_DB_ID &&
      process.env.NOTION_HOMEWORK_DB_ID &&
      process.env.NOTION_EXAM_ALERTS_DB_ID
  );
}

export const sampleClasses = [
  {
    level: "GK002",
    label: "기초 리딩 · 파닉스 · 녹음 숙제",
    chip: "저학년",
    students: [{ name: "김채은" }, { name: "이하준" }, { name: "박민준" }]
  },
  {
    level: "GR101",
    label: "리딩 · 문법 · 발표 준비",
    chip: "초등 심화",
    students: [{ name: "이서윤" }, { name: "정인우" }, { name: "김준엽" }]
  },
  {
    level: "화수금 CK",
    label: "중등 문법 · 단어시험 · 오답관리",
    chip: "중등",
    students: [{ name: "정연서" }, { name: "최시은" }, { name: "박용준" }]
  }
];

export const sampleNotice = {
  studentName: "정연서",
  level: "화수금 CK",
  date: "2026-06-01",
  alert: {
    word: "58/60",
    grammar: "확인 완료",
    retest: "해당 없음",
    memo: "틀린 단어만 한 번 더 소리 내어 복습해주세요."
  },
  homework: {
    previous: "O",
    word: "단어시험 진행",
    grammar: "Chapter 9 문법테스트 오답",
    notice: "내일은 발표날입니다. 마지막까지 발표대본을 외울 수 있도록 많은 격려 부탁드립니다^^",
    todayClass: "Chapter 9 실전테스트 오답 + Chapter 9 문법테스트 오답 해설",
    homework: "문법: 중학영문법클리어 Chapter 9 실전테스트 오답\n단어시험 준비: 소리와 철자 모두 완벽하게 외우기",
    online: "KR020"
  }
};

function cleanNotionId(id) {
  return String(id || "").replace(/-/g, "").trim();
}

async function notionFetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": options.version || NOTION_VERSION,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${response.status} ${text}`);
  }

  return JSON.parse(text);
}

async function queryDataSource(dataSourceId, body = {}) {
  const cleanId = cleanNotionId(dataSourceId);
  const results = [];
  let cursor = undefined;

  do {
    const data = await notionFetchJson(
      `https://api.notion.com/v1/data_sources/${cleanId}/query`,
      {
        method: "POST",
        version: "2025-09-03",
        body: {
          page_size: 100,
          start_cursor: cursor,
          ...body
        }
      }
    );

    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

async function queryOldDatabase(databaseId, body = {}) {
  const cleanId = cleanNotionId(databaseId);
  const results = [];
  let cursor = undefined;

  do {
    const data = await notionFetchJson(
      `https://api.notion.com/v1/databases/${cleanId}/query`,
      {
        method: "POST",
        version: "2022-06-28",
        body: {
          page_size: 100,
          start_cursor: cursor,
          ...body
        }
      }
    );

    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

async function queryDatabaseViaFirstDataSource(databaseId, body = {}) {
  const cleanId = cleanNotionId(databaseId);

  const database = await notionFetchJson(
    `https://api.notion.com/v1/databases/${cleanId}`,
    {
      method: "GET",
      version: "2025-09-03"
    }
  );

  const firstDataSourceId = database?.data_sources?.[0]?.id;

  if (!firstDataSourceId) {
    throw new Error("database 안에서 data_source를 찾지 못했습니다.");
  }

  return queryDataSource(firstDataSourceId, body);
}

export async function notionQuery(id, body = {}) {
  const cleanId = cleanNotionId(id);
  const errors = [];

  try {
    return await queryDataSource(cleanId, body);
  } catch (error) {
    errors.push(`data_source 방식 실패: ${error.message}`);
  }

  try {
    return await queryOldDatabase(cleanId, body);
  } catch (error) {
    errors.push(`old_database 방식 실패: ${error.message}`);
  }

  try {
    return await queryDatabaseViaFirstDataSource(cleanId, body);
  } catch (error) {
    errors.push(`database→data_source 변환 실패: ${error.message}`);
  }

  throw new Error(errors.join(" / "));
}

export function getProp(page, names) {
  const props = page?.properties || {};

  for (const name of names) {
    if (props[name]) return props[name];
  }

  return null;
}

export function propText(prop) {
  if (!prop) return "";

  switch (prop.type) {
    case "title":
      return (prop.title || []).map((t) => t?.plain_text || "").join("").trim();

    case "rich_text":
      return (prop.rich_text || []).map((t) => t?.plain_text || "").join("").trim();

    case "select":
      return prop.select?.name || "";

    case "status":
      return prop.status?.name || "";

    case "multi_select":
      return (prop.multi_select || []).map((v) => v?.name || "").join(", ").trim();

    case "number":
      return prop.number === null || prop.number === undefined ? "" : String(prop.number);

    case "checkbox":
      return prop.checkbox ? "true" : "false";

    case "date":
      return prop.date?.start || "";

    case "email":
      return prop.email || "";

    case "phone_number":
      return prop.phone_number || "";

    case "url":
      return prop.url || "";

    case "formula":
      if (prop.formula?.type === "string") return prop.formula.string || "";
      if (prop.formula?.type === "number") return String(prop.formula.number ?? "");
      if (prop.formula?.type === "boolean") return prop.formula.boolean ? "true" : "false";
      if (prop.formula?.type === "date") return prop.formula.date?.start || "";
      return "";

    case "rollup":
      if (prop.rollup?.type === "array") {
        return (prop.rollup.array || []).map(propText).filter(Boolean).join(", ");
      }
      if (prop.rollup?.type === "number") return String(prop.rollup.number ?? "");
      if (prop.rollup?.type === "date") return prop.rollup.date?.start || "";
      return "";

    default:
      return "";
  }
}

export function propCheckbox(prop, defaultValue = false) {
  if (!prop) return defaultValue;
  if (prop.type === "checkbox") return Boolean(prop.checkbox);
  return propText(prop) === "true";
}

export function propNumber(prop) {
  if (!prop) return null;

  if (prop.type === "number") {
    return prop.number;
  }

  const txt = propText(prop);
  const n = Number(txt);

  return Number.isFinite(n) ? n : null;
}

export function normalizeLevel(level) {
  return String(level || "")
    .trim()
    .replace(/\s*\([^)]+\)\s*$/g, "")
    .trim();
}

export function todayKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function isActiveStudent(status) {
  const text = String(status || "").trim();

  if (!text) return true;

  return text.includes("재원");
}

export function classMeta(level) {
  const l = String(level || "");

  if (l.startsWith("GK")) {
    return {
      chip: "저학년",
      label: "기초 리딩 · 파닉스 · 녹음 숙제"
    };
  }

  if (l.startsWith("GR")) {
    return {
      chip: "초등 심화",
      label: "리딩 · 문법 · 발표 준비"
    };
  }

  if (l.includes("CK") || l.includes("중등")) {
    return {
      chip: "중등",
      label: "중등 문법 · 단어시험 · 오답관리"
    };
  }

  if (l.includes("내신")) {
    return {
      chip: "내신",
      label: "학교별 내신 · 본문 · 서술형"
    };
  }

  return {
    chip: "수업반",
    label: "오늘의 수업 · 숙제 안내"
  };
}

export function getStudentFromPage(page) {
  const props = page?.properties || {};

  let name = propText(getProp(page, ["이름", "학생명", "Name", "name"]));

  if (!name) {
    const titleProp = Object.values(props).find((prop) => prop?.type === "title");

    if (titleProp && Array.isArray(titleProp.title)) {
      name = titleProp.title.map((t) => t?.plain_text || "").join("").trim();
    }
  }

  const rawLevel = propText(getProp(page, ["레벨", "반", "level", "Level"]));
  const status = propText(getProp(page, ["상태", "status", "Status"]));
  const pin = propText(getProp(page, ["확인번호", "비밀번호", "PIN", "pin"]));
  const order = propNumber(getProp(page, ["표시순서", "순서", "order", "Order"]));

  return {
    name: String(name || "").trim(),
    rawLevel: String(rawLevel || "").trim(),
    level: normalizeLevel(rawLevel),
    status,
    pin: String(pin || "").trim(),
    order
  };
}

export function getHomeworkFromPage(page) {
  const rawLevel = propText(getProp(page, ["레벨", "반", "level", "Level"]));

  return {
    title: propText(getProp(page, ["안내제목", "제목", "Name", "name"])),
    date: propText(getProp(page, ["날짜", "date", "Date"])),
    rawLevel: String(rawLevel || "").trim(),
    level: normalizeLevel(rawLevel),
    previous: propText(getProp(page, ["지난 숙제", "지난숙제"])),
    word: propText(getProp(page, ["단어시험", "단어 시험", "단어"])),
    grammar: propText(getProp(page, ["문법시험", "문법 시험", "문법"])),
    notice: propText(getProp(page, ["전달사항", "공지", "특이사항"])),
    todayClass: propText(getProp(page, ["오늘의 수업", "오늘 수업", "수업"])),
    homework: propText(getProp(page, ["오늘의 숙제", "오늘 숙제", "숙제"])),
    online: propText(getProp(page, ["온라인 숙제", "발표 학습번호", "학습번호"])),
    public: propCheckbox(getProp(page, ["공개", "public", "Public"]), true)
  };
}

export function getAlertFromPage(page) {
  const rawLevel = propText(
    getProp(page, ["레벨/반", "레벨", "반", "level", "Level"])
  );

  return {
    title: propText(getProp(page, ["알림제목", "제목", "Name", "name"])),

    date: propText(getProp(page, ["날짜", "date", "Date"])),

    rawLevel: String(rawLevel || "").trim(),
    level: normalizeLevel(rawLevel),

    studentName: propText(
      getProp(page, ["학생명", "이름", "studentName", "Name", "name"])
    ).trim(),

    word: propText(
      getProp(page, ["단어시험", "단어 시험", "단어"])
    ),

    grammar: propText(
      getProp(page, ["문법시험", "문법 시험", "문법"])
    ),

    retest: propText(
      getProp(page, ["재시험", "재시험 여부"])
    ),

    memo: propText(
      getProp(page, ["개별 안내", "개별안내", "개별메모", "메모", "개별 메모"])
    ),

    individualNotice: propText(
      getProp(page, [
        "개별전달사항",
        "개별 전달사항",
        "개별전당사항",
        "개별 전당사항",
        "전달사항",
        "개별공지",
        "개별 공지"
      ])
    ),

    individualHomework: propText(
      getProp(page, [
        "개별숙제",
        "개별 숙제",
        "숙제메모",
        "숙제 메모",
        "개별과제",
        "개별 과제"
      ])
    ),

    homeworkStatus: propText(
      getProp(page, [
        "숙제상태",
        "숙제 상태",
        "지난숙제상태",
        "지난 숙제 상태"
      ])
    ),

    public: propCheckbox(
      getProp(page, ["공개", "public", "Public"]),
      true
    )
  };
}

export function latestByDate(items, targetDate = todayKst()) {
  const valid = (items || [])
    .filter((item) => item && item.public !== false && item.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return valid.find((item) => String(item.date).slice(0, 10) <= targetDate) || valid[0] || null;
}
