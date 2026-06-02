"use client";

import { useEffect, useMemo, useState } from "react";

function classUi(level, index = 0) {
  const l = String(level || "");
  if (l.startsWith("GK")) return { iconClass: "g1", heroClass: "", icon: "⭐" };
  if (l.startsWith("GR")) return { iconClass: "g2", heroClass: "sky", icon: "⭐" };
  if (l.includes("CK") || l.includes("중등")) return { iconClass: "g3", heroClass: "amber", icon: "⭐" };
  if (l.includes("내신")) return { iconClass: "g4", heroClass: "green", icon: "⭐" };
  const list = [
    { iconClass: "g1", heroClass: "", icon: "⭐" },
    { iconClass: "g2", heroClass: "sky", icon: "⭐" },
    { iconClass: "g3", heroClass: "amber", icon: "⭐" },
    { iconClass: "g4", heroClass: "green", icon: "⭐" }
  ];
  return list[index % list.length];
}

function todayText() {
  return new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

function SectionCard({ icon, tone, title, children }) {
  return (
    <div className="info-card">
      <div className="info-title">
        <div className={`info-icon ${tone}`}>{icon}</div>
        <h3>{title}</h3>
      </div>
      <div className="info-body">{children}</div>
    </div>
  );
}

export default function Page() {
  const [classes, setClasses] = useState([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [notice, setNotice] = useState(null);
  const [noticeLoading, setNoticeLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/public", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "학생목록 로딩 실패");
        setClasses(data.classes || []);
        setSource(data.source || "");
      } catch (error) {
        setLoadError(String(error.message || error));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredClasses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes.filter(c =>
      String(c.level || "").toLowerCase().includes(q) ||
      String(c.label || "").toLowerCase().includes(q)
    );
  }, [classes, search]);

  function showHome() {
    setSelectedClass(null);
    setSelectedStudent("");
    setNotice(null);
    setPinOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showClass() {
    setSelectedStudent("");
    setNotice(null);
    setPinOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPin(studentName) {
    setSelectedStudent(studentName);
    setPin("");
    setPinError("");
    setPinOpen(true);
  }

  async function unlockStudent() {
    if (pin.length < 4 || !selectedClass || !selectedStudent) return;
    try {
      setNoticeLoading(true);
      setPinError("");
      const res = await fetch("/api/notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: selectedClass.level, studentName: selectedStudent, pin })
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(data?.error || "확인번호를 다시 확인해주세요.");
        return;
      }
      setNotice(data);
      setPinOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setPinError(String(error.message || error));
    } finally {
      setNoticeLoading(false);
    }
  }

  const selectedUi = selectedClass ? classUi(selectedClass.level) : null;

  return (
    <div className="app">
      <header className="top">
        <button className="back" style={{ display: selectedClass ? "block" : "none" }} onClick={notice ? showClass : showHome}>‹</button>
        <div className="logo">📘</div>
        <div>
          <div className="brand-small">CHILDU MOST ENGLISH</div>
          <div className="brand-title">차일드유 숙제 안내장</div>
        </div>
      </header>

      <main>
        {!selectedClass && (
          <section>
            <div className="hero">
              <div className="badge">✨ 오늘의 학습 안내</div>
              <h1>우리 아이의 오늘 학습 안내를 정리해두었습니다.</h1>
              <p>숙제 안내장은 수업 후 순차적으로 업데이트됩니다. 반과 학생 이름을 선택해 오늘의 학습 내용을 확인해 주세요.</p>
              <div className="date-pill">📅 <span>{todayText()}</span></div>
            </div>

            <div className="search-card">
              <div className="search">🔎 <input value={search} onChange={e => setSearch(e.target.value)} placeholder="반 이름을 검색해 주세요" /></div>
            </div>

            {source === "sample" && (
              <div className="note-box">
                현재는 샘플 데이터로 표시 중입니다. Vercel 환경변수와 노션 DB 연결이 완료되면 실제 학생목록이 표시됩니다.
              </div>
            )}

            <div className="section-title">
              <h2>반을 선택해 주세요</h2>
              <div className="count">총 {filteredClasses.length}개 반</div>
            </div>

            {loading && <div className="loading">학생목록을 불러오는 중입니다.</div>}
            {loadError && <div className="error-box">{loadError}</div>}
            {!loading && !loadError && filteredClasses.length === 0 && <div className="empty-box">표시할 반이 없습니다.</div>}

            {filteredClasses.map((klass, index) => {
              const ui = classUi(klass.level, index);
              return (
                <button key={klass.level} className="class-card" onClick={() => setSelectedClass(klass)}>
                  <div className={`class-icon ${ui.iconClass}`}>{ui.icon}</div>
                  <div className="class-info">
                    <div className="class-row">
                      <div className="class-name">{klass.level}</div>
                      <span className="chip">{klass.chip || "수업반"}</span>
                    </div>
                    <div className="class-label">{klass.label || "오늘의 수업 · 숙제 안내"}</div>
                  </div>
                </button>
              );
            })}
          </section>
        )}

        {selectedClass && !notice && (
          <section>
            <div className={`class-hero ${selectedUi?.heroClass || ""}`}>
              <span className="mini">{selectedClass.chip || "수업반"}</span>
              <h2>{selectedClass.level} 숙제 안내장</h2>
              <p>학생 이름을 선택한 뒤 보호자 확인 번호를 입력해 주세요.</p>
            </div>

            <div className="panel">
              <div className="panel-head">👧🏻 학생 이름 선택</div>
              <div className="students">
                {(selectedClass.students || []).map(student => (
                  <button key={student.name} className="student-btn" onClick={() => openPin(student.name)}>
                    {student.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="note-box">
              📌 개별 시험 안내는 학생 확인 후 상단에 표시됩니다. 반 공통 숙제는 모든 학생에게 동일하게 안내됩니다.
            </div>
          </section>
        )}

        {selectedClass && notice && (
          <section>
            <div className="student-head">
              <div className="small">{notice.level || selectedClass.level}</div>
              <h2>{notice.studentName} 숙제 안내장</h2>
              <p>{notice.date || todayText()}</p>
            </div>

            <div className="personal">
              <div className="personal-title">
                <div className="round-icon">✨</div>
                <div>
                  <div className="caption">개별 학습 알림</div>
                  <h3>{notice.alert ? "오늘의 개인 안내" : "개별 안내 없음"}</h3>
                </div>
              </div>

              {notice.alert ? (
                <div>
                  <div className="score-grid">
                    <div className="score"><div className="k">단어</div><div className="v">{notice.alert.word || "-"}</div></div>
                    <div className="score"><div className="k">문법</div><div className="v">{notice.alert.grammar || "-"}</div></div>
                    <div className="score"><div className="k">재시험</div><div className="v">{notice.alert.retest || "-"}</div></div>
                  </div>
                  <div className="memo">{notice.alert.memo || "개별 메모는 없습니다."}</div>
                </div>
              ) : (
                <div className="memo">오늘은 반 공통 숙제 안내만 확인해 주세요.</div>
              )}
            </div>

            {!notice.homework ? (
              <div className="error-box">오늘 등록된 반별 숙제가 없습니다. 공개 체크와 날짜, 레벨을 확인해 주세요.</div>
            ) : (
              <div>
                <SectionCard icon="✅" tone="blue" title="지난 숙제">{notice.homework.previous || "-"}</SectionCard>
                <SectionCard icon="✏️" tone="violet" title="단어 · 문법 확인">{`단어 시험: ${notice.homework.word || "-"}\n문법 시험: ${notice.homework.grammar || "-"}`}</SectionCard>
                <SectionCard icon="📣" tone="rose" title="전달사항">{notice.homework.notice || "-"}</SectionCard>
                <SectionCard icon="📘" tone="yellow" title="오늘의 수업">{notice.homework.todayClass || "-"}</SectionCard>
                <SectionCard icon="📝" tone="orange" title="오늘의 숙제">{notice.homework.homework || "-"}</SectionCard>
                <SectionCard icon="✨" tone="green" title="온라인 숙제">{notice.homework.online || "-"}</SectionCard>
              </div>
            )}
          </section>
        )}
      </main>

      <div className={`sheet ${pinOpen ? "open" : ""}`}>
        <div className="sheet-card">
          <div className="handle"></div>
          <div className="pin-head">
            <div className="pin-icon">🔐</div>
            <div>
              <h3>보호자 확인 번호</h3>
              <p>{selectedStudent} 학생 안내장을 확인합니다.</p>
            </div>
          </div>
          <input
            className="pin-input"
            value={pin}
            inputMode="numeric"
            maxLength={4}
            placeholder="뒤 4자리"
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={e => { if (e.key === "Enter") unlockStudent(); }}
          />
          <div className="pin-error" style={{ display: pinError ? "block" : "none" }}>{pinError}</div>
          <button className="primary" onClick={unlockStudent} disabled={noticeLoading}>
            {noticeLoading ? "확인 중..." : "안내장 확인하기"}
          </button>
          <button className="secondary" onClick={() => setPinOpen(false)}>취소</button>
        </div>
      </div>
    </div>
  );
}
