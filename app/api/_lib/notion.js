const NOTION_VERSION = "2026-03-11";

export function envReady() {
  return Boolean(
    process.env.NOTION_TOKEN &&
    process.env.NOTION_STUDENTS_DB_ID &&
    process.env.NOTION_HOMEWORK_DB_ID &&
    process.env.NOTION_EXAM_ALERTS_DB_ID
  );
}

export const sampleClasses = [
  { level: "GK002", label: "기초 리딩 · 파닉스 · 녹음 숙제", chip: "저학년", students: [{ name: "김채은" }, { name: "이하준" }, { name: "박민준" }] },
  { level: "GR101", label: "리딩 · 문법 · 발표 준비", chip: "초등 심화", students: [{ name: "이서윤" }, { name: "정인우" }, { name: "김준엽" }] },
  { level: "화수금 CK", label: "중등 문법 · 단어시험 · 오답관리", chip: "중등", students: [{ name: "정연서" }, { name: "최시은" }, { name: "박용준" }] }
];

export const sampleNotice = {
  studentName: "정연서",
  level: "화수금 CK",
  date: "2026-06-01",
  alert: { word: "58/60", grammar: "확인 완료", retest: "해당 없음", memo: "틀린 단어만 한 번 더 소리 내어 복습해주세요." },
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

async function notionFetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": options.version || NOTION_VERSION,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${response.status} ${text}`);
  }

  return JSON.parse(text);
}

async function queryDataSource(dataSourceId, body = {}) {
  const results = [];
  let cursor = undefined;

  do {
    const data = await notionFetchJson(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
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
  const results = [];
  let cursor = undefined;

  do {
    const data = await notionFetchJson(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
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

export async function notionQuery(id, body = {}) {
  const cleanId = String(id || "").replace(/-/g, "").trim();
  const errors = [];

  // 1순위: 새 Notion data source 방식
  try {
    return await queryDataSource(cleanId, body);
  } catch (error) {
    errors.push(`data_source 방식 실패: ${error.message}`);
  }

  // 2순위: 예전 database 방식
  try {
    return await queryOldDatabase(cleanId, body);
  } catch (error) {
    errors.push(`old_database 방식 실패: ${error.message}`);
  }

  // 3순위: database ID가 들어온 경우, database 안의 첫 data source를 찾아서 조회
  try {
    const database = await notionFetchJson(
      `https://api.notion.com/v1/databases/${cleanId}`,
      { method: "GET" }
    );

    const firstDataSourceId = database?.data_sources?.[0]?.id;

    if (!firstDataSourceId) {
      throw new Error("database 안에서 data_source를 찾지 못했습니다.");
    }

    return await queryDataSource(firstDataSourceId.replace(/-/g, ""), body);
  } catch (error) {
    errors.push(`database→data_source 변환 실패: ${error.message}`);
  }

  throw new Error(errors.join(" / "));
}
