"use client";

import { useState } from "react";

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
  const [studentName, setStudentName] = useState("");
  const [pin, setPin] = useState("");
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitNotice(event) {
    event.preventDefault();

    const cleanName = studentName.trim();
    const cleanPin = pin.trim();

    if (!cleanName) {
      setError("학생 이름을 입력해 주세요.");
      return;
    }

    if (cleanPin.length < 4) {
      setError("보호자 확인번호 4자리를 입력해 주세요.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/notice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          studentName: cleanName,
          pin: cleanPin
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "안내장을 불러오지 못했습니다.");
        return;
      }

      setNotice(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError("안내장을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function resetToHome() {
    setNotice(null);
    setStudentName("");
    setPin("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="app">
      <header className="top">
        <button
          className="back"
          style={{ display: notice ? "block" : "none" }}
          onClick={resetToHome}
        >
          ‹
        </button>

        <div className="logo">📘</div>

        <div>
          <div className="brand-small">CHILDU MOST ENGLISH</div>
          <div className="brand-title">차일드유 숙제 안내장</div>
        </div>
      </header>

      <main>
        {!notice && (
          <section>
            <div className="hero">
              <div className="badge">✨ 오늘의 학습 안내</div>
              <h1>우리 아이의 오늘 학습 안내를 정리해두었습니다.</h1>
              <p>
                숙제 안내장은 수업 후 순차적으로 업데이트됩니다.
                학생 이름과 보호자 확인번호를 입력해 오늘의 학습 내용을 확인해 주세요.
              </p>
              <div className="date-pill">
                📅 <span>{todayText()}</span>
              </div>
            </div>

            <div className="note-box">
              📌 학생이름과 보호자 확인번호를 확인한 후, 바르게 입력해주시길 바랍니다.
            </div>

            <form onSubmit={submitNotice} className="panel">
              <div className="panel-head">🔐 학생 정보 확인</div>

              <div style={{ display: "grid", gap: "14px" }}>
                <label style={{ display: "grid", gap: "7px" }}>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 900,
                      color: "#6b7280"
                    }}
                  >
                    학생 이름
                  </span>
                  <input
                    value={studentName}
                    onChange={(event) => setStudentName(event.target.value)}
                    placeholder="예: ㅇㅇㅇ"
                    autoComplete="off"
                    style={{
                      width: "100%",
                      height: "54px",
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      borderRadius: "19px",
                      padding: "0 16px",
                      fontSize: "17px",
                      fontWeight: 800,
                      outline: "none"
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: "7px" }}>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 900,
                      color: "#6b7280"
                    }}
                  >
                    보호자 확인번호
                  </span>
                  <input
                    className="pin-input"
                    value={pin}
                    onChange={(event) =>
                      setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="뒤 4자리"
                    autoComplete="off"
                  />
                </label>
              </div>

              {error && (
                <div className="error-box" style={{ marginTop: "14px" }}>
                  {error}
                </div>
              )}

              <button className="primary" type="submit" disabled={loading}>
                {loading ? "확인 중..." : "안내장 확인하기"}
              </button>
            </form>
          </section>
        )}

        {notice && (
          <section>
            <div className="student-head">
              <div className="small">오늘의 학습 안내</div>
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
                    <div className="score">
                      <div className="k">단어</div>
                      <div className="v">{notice.alert.word || "-"}</div>
                    </div>
                    <div className="score">
                      <div className="k">문법</div>
                      <div className="v">{notice.alert.grammar || "-"}</div>
                    </div>
                    <div className="score">
                      <div className="k">재시험</div>
                      <div className="v">{notice.alert.retest || "-"}</div>
                    </div>
                  </div>

                  <div className="memo">
                    {notice.alert.memo || "개별 메모는 없습니다."}
                  </div>
                </div>
              ) : (
                <div className="memo">
                  오늘은 반 공통 숙제 안내만 확인해 주세요.
                </div>
              )}
            </div>

            {!notice.homework ? (
              <div className="error-box">
                오늘 등록된 숙제가 없습니다. 학원에서 순차적으로 업데이트 중입니다.
              </div>
            ) : (
              <div>
                <SectionCard icon="✅" tone="blue" title="지난 숙제">
                  {notice.homework.previous || "-"}
                </SectionCard>

                <SectionCard icon="✏️" tone="violet" title="단어 · 문법 확인">
                  {`단어 시험: ${notice.homework.word || "-"}\n문법 시험: ${
                    notice.homework.grammar || "-"
                  }`}
                </SectionCard>

                <SectionCard icon="📣" tone="rose" title="전달사항">
                  {notice.homework.notice || "-"}
                </SectionCard>

                <SectionCard icon="📘" tone="yellow" title="오늘의 수업">
                  {notice.homework.todayClass || "-"}
                </SectionCard>

                <SectionCard icon="📝" tone="orange" title="오늘의 숙제">
                  {notice.homework.homework || "-"}
                </SectionCard>

                <SectionCard icon="✨" tone="green" title="온라인 숙제">
                  {notice.homework.online || "-"}
                </SectionCard>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
