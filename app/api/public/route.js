import {
  classMeta,
  envReady,
  getStudentFromPage,
  isActiveStudent,
  notionQuery,
  sampleClasses
} from "../_lib/notion";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!envReady()) {
      return Response.json({ source: "sample", classes: sampleClasses });
    }

    const pages = await notionQuery(process.env.NOTION_STUDENTS_DB_ID);
    const students = pages
      .map(getStudentFromPage)
      .filter(s => s.name && s.level && isActiveStudent(s.status));

    const map = new Map();

    for (const student of students) {
      if (!map.has(student.level)) {
        const meta = classMeta(student.level);
        map.set(student.level, { level: student.level, label: meta.label, chip: meta.chip, students: [] });
      }
      map.get(student.level).students.push({ name: student.name, order: student.order });
    }

    const classes = Array.from(map.values())
      .map(c => ({
        ...c,
        students: c.students
          .sort((a, b) => {
            const ao = a.order ?? 9999;
            const bo = b.order ?? 9999;
            if (ao !== bo) return ao - bo;
            return a.name.localeCompare(b.name, "ko", { numeric: true });
          })
          .map(({ name }) => ({ name }))
      }))
      .sort((a, b) => a.level.localeCompare(b.level, "ko", { numeric: true }));

    return Response.json({ source: "notion", classes });
  } catch (error) {
    return Response.json(
      { error: "학생목록을 불러오지 못했습니다.", detail: String(error?.message || error) },
      { status: 500 }
    );
  }
}
