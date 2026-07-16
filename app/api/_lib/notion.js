const NOTION_VERSION = "2025-09-03";
const NOTION_OLD_VERSION = "2022-06-28";

function notionHeaders(version = NOTION_VERSION) {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": version,
    "Content-Type": "application/json"
  };
}

async function notionFetch(url, options = {}, version = NOTION_VERSION) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...notionHeaders(version),
      ...(options.headers || {})
    },
    cache: "no-store"
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Notion API error: ${res.status} ${res.statusText}`;

    throw new Error(message);
  }

  return data;
}

async function queryDataSource(dataSourceId) {
  let results = [];
  let cursor = undefined;

  do {
    const data = await notionFetch(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {})
        })
      },
      NOTION_VERSION
    );

    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

async function queryOldDatabase(databaseId) {
  let results = [];
  let cursor = undefined;

  do {
    const data = await notionFetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {})
        })
      },
      NOTION_OLD_VERSION
    );

    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

async function queryDatabaseViaFirstDataSource(databaseId) {
  const database = await notionFetch(
    `https://api.notion.com/v1/databases/${databaseId}`,
    {
      method: "GET"
    },
    NOTION_VERSION
  );

  const dataSourceId = database?.data_sources?.[0]?.id;

  if (!dataSourceId) {
    throw new Error("이 데이터베이스에서 data source를 찾지 못했습니다.");
  }

  return queryDataSource(dataSourceId);
}

export async function notionQuery(id) {
  if (!id) {
    throw new Error("Notion DB ID가 비어 있습니다.");
  }

  const cleanId = String(id).trim();

  const errors = [];

  try {
    return await queryDataSource(cleanId);
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  try {
    return await queryDatabaseViaFirstDataSource(cleanId);
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  try {
    return await queryOldDatabase(cleanId);
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  throw new Error(errors.join(" / "));
}

export function envReady() {
  return Boolean(
    process.env.NOTION_TOKEN &&
      process.env.NOTION_STUDENTS_DB_ID &&
      process.env.NOTION_HOMEWORK_DB_ID &&
      process.env.NOTION_EXAM_ALERTS_DB_ID
  );
}

export function todayKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function normalizeLevel(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\([^)]+\)\s*$/, "")
    .trim();
}

function compact(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function propPlainTextArray(arr) {
  return (arr || [])
    .map((item) => item?.plain_text || item?.text?.content || "")
    .join("")
    .trim();
}

export function getProp(page, names = []) {
  const properties = page?.properties || {};

  for (const name of names) {
    if (properties[name]) return properties[name];
  }

  const entries = Object.entries(properties);

  for (const name of names) {
    const found = entries.find(
      ([key]) => compact(key).toLowerCase() === compact(name).toLowerCase()
    );

    if (found) return found[1];
  }

  return null;
}

export function propText(prop) {
  if (!prop) return "";

  switch (prop.type) {
    case "title":
      return propPlainTextArray(prop.title);

    case "rich_text":
      return propPlainTextArray(prop.rich_text);

    case "select":
      return prop.select?.name || "";

    case "status":
      return prop.status?.name || "";

    case "multi_select":
      return (prop.multi_select || []).map((item) => item.name).join(", ");

    case "date":
      return prop.date?.start || "";

    case "checkbox":
      return prop.checkbox ? "O" : "";

    case "number":
      return prop.number === null || prop.number === undefined
        ? ""
        : String(prop.number);

    case "url":
      return prop.url || "";

    case "email":
      return prop.email || "";

    case "phone_number":
      return prop.phone_number || "";

    case "formula":
      if (prop.formula?.type === "string") return prop.formula.string || "";
      if (prop.formula?.type === "number")
        return prop.formula.number === null || prop.formula.number === undefined
          ? ""
          : String(prop.formula.number);
      if (prop.formula?.type === "boolean")
        return prop.formula.boolean ? "O" : "";
      if (prop.formula?.type === "date") return prop.formula.date?.start || "";
      return "";

    case "rollup":
      if (prop.rollup?.type === "array") {
        return (prop.rollup.array || []).map(propText).filter(Boolean).join(", ");
      }
      if (prop.rollup?.type === "number")
        return prop.rollup.number === null || prop.rollup.number === undefined
          ? ""
          : String(prop.rollup.number);
      return "";

    default:
      return "";
  }
}

export function propCheckbox(prop, defaultValue = false) {
  if (!prop) return defaultValue;

  if (prop.type === "checkbox") {
    return Boolean(prop.checkbox);
  }

  const text = propText(prop).trim().toLowerCase();

  if (!text) return defaultValue;

  if (["o", "true", "yes", "y", "공개", "체크", "checked"].includes(text)) {
    return true;
  }

  if (["x", "false", "no", "n", "비공개", "미공개"].includes(text)) {
    return false;
  }

  return defaultValue;
}

export function isActiveStudent(status) {
  const text = String(status || "").trim();

  if (!text) return true;

  if (text.includes("퇴원")) return false;
  if (text.includes("휴원")) return false;
  if (text.includes("중단")) return false;

  return text.includes("재원") || text.includes("수강") || text.includes("active");
}

export function getStudentFromPage(page) {
  const rawLevel = propText(
    getProp(page, ["레벨/반", "레벨", "반", "level", "Level"])
  );

  return {
    name: propText(
      getProp(page, ["이름", "학생명", "학생 이름", "Name", "name"])
    ).trim(),

    rawLevel: String(rawLevel || "").trim(),
    level: normalizeLevel(rawLevel),

    grade: propText(getProp(page, ["학년", "grade", "Grade"])),

    status: propText(getProp(page, ["상태", "status", "Status"])),

    pin: propText(
      getProp(page, ["확인번호", "보호자 확인번호", "PIN", "pin", "비밀번호"])
    ).trim()
  };
}

export function getHomeworkFromPage(page) {
  const rawLevel = propText(
    getProp(page, ["레벨/반", "레벨", "반", "level", "Level"])
  );

  return {
    title: propText(getProp(page, ["안내제목", "제목", "Name", "name"])),

    rawLevel: String(rawLevel || "").trim(),
    level: normalizeLevel(rawLevel),

    date: propText(getProp(page, ["날짜", "date", "Date"])),

    previous: propText(
      getProp(page, ["지난 숙제", "지난숙제", "숙제 확인", "숙제확인"])
    ),

    word: propText(getProp(page, ["단어시험", "단어 시험", "단어"])),

    grammar: propText(
      getProp(page, [
        "문법시험/독해시험",
        "문법/독해시험",
        "문법·독해시험",
        "문법 독해시험",
        "문법시험",
        "문법 시험",
        "문법",
        "독해시험",
        "독해 시험",
        "독해"
      ])
    ),

    notice: propText(
      getProp(page, ["전달사항", "전달 사항", "공지", "안내", "메모"])
    ),

    todayClass: propText(
      getProp(page, ["오늘의 수업", "오늘 수업", "오늘수업", "수업"])
    ),

    homework: propText(
      getProp(page, ["오늘의 숙제", "오늘 숙제", "오늘숙제", "숙제"])
    ),

    online: propText(
      getProp(page, [
        "온라인 숙제",
        "온라인숙제",
        "발표 학습번호",
        "발표학습번호",
        "학습번호",
        "발표"
      ])
    ),

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
      getProp(page, ["학생명", "이름", "학생 이름", "studentName", "Name", "name"])
    ).trim(),

    word: propText(getProp(page, ["단어시험", "단어 시험", "단어"])),

    grammar: propText(
      getProp(page, [
        "문법시험/독해시험",
        "문법/독해시험",
        "문법·독해시험",
        "문법 독해시험",
        "문법시험",
        "문법 시험",
        "문법",
        "독해시험",
        "독해 시험",
        "독해"
      ])
    ),

    retest: propText(getProp(page, ["재시험", "재시험 여부", "리테스트"])),

    memo: propText(
      getProp(page, ["개별 안내", "개별안내", "개별메모", "개별 메모", "메모"])
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

    public: propCheckbox(getProp(page, ["공개", "public", "Public"]), true)
  };
}

function dateValue(item) {
  return String(item?.date || "").trim();
}

export function latestByDate(items = [], targetDate = todayKst()) {
  const validItems = (items || []).filter((item) => dateValue(item));

  if (validItems.length === 0) {
    return (items || [])[0] || null;
  }

  const beforeOrSame = validItems
    .filter((item) => dateValue(item) <= targetDate)
    .sort((a, b) => dateValue(b).localeCompare(dateValue(a)));

  if (beforeOrSame.length > 0) {
    return beforeOrSame[0];
  }

  return validItems.sort((a, b) => dateValue(b).localeCompare(dateValue(a)))[0];
}

export const sampleNotice = {
  date: todayKst(),

  alert: {
    word: "-",
    grammar: "-",
    retest: "-",
    memo: "",
    individualNotice: "",
    individualHomework: "",
    homeworkStatus: ""
  },

  homework: {
    previous: "O",
    word: "-",
    grammar: "-",
    notice: "샘플 안내입니다.",
    todayClass: "샘플 수업",
    homework: "샘플 숙제",
    online: "-"
  }
};
