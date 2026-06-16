"use client";

import { useMemo, useState } from "react";

function todayText() {
  return new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

function formatDateLabel(dateString) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short"
  });
}

function todayIsoKst(offset = 0) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  kst.setUTCDate(kst.getUTCDate() + offset);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateButtonLabel(dateString) {
  if (dateString === todayIsoKst(0)) return "오늘";
  if (dateString === todayIsoKst(-1)) return "어제";

  return formatDateLabel(dateString);
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
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedHomework = useMemo(() => {
    if (!notice) return null;

    if (notice.homeworkHistory?.length) {
      const target =
        notice.homeworkHistory.find((item) => item.date === selectedDate) ||
        notice.homeworkHistory[0];

      return target;
    }

    if (notice.homework) {
      return {
        date: notice.date,
        homework: notice.homework
      };
    }

    return null;
  }, [notice, selectedDate]);

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

      if (data.homeworkHistory?.length) {
        setSelectedDate(data.homeworkHistory[0].date);
      } else {
        setSelectedDate(data.date || "");
      }

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
    setSelectedDate("");
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

                  {notice.alert.homeworkStatus && (
                    <div className="memo">
                      <strong>숙제 확인</strong>
                      <br />
                      {notice.alert.homeworkStatus}
                    </div>
                  )}

                  {notice.alert.individualNotice && (
                    <div className="memo">
                      <strong>개별 전달사항</strong>
                      <br />
                      {notice.alert.individualNotice}
                    </div>
                  )}

                  {notice.alert.individualHomework && (
                    <div className="memo">
                      <strong>개별 숙제</strong>
                      <br />
                      {notice.alert.individualHomework}
                    </div>
                  )}

                  {notice.alert.memo && (
                    <div className="memo">
                      <strong>개별 안내</strong>
                      <br />
                      {notice.alert.memo}
                    </div>
                  )}

                  {!notice.alert.homeworkStatus &&
                    !notice.alert.individualNotice &&
                    !notice.alert.individualHomework &&
                    !notice.alert.memo && (
                      <div className="memo">개별 안내는 없습니다.</div>
                    )}
                </div>
              ) : (
                <div className="memo">
                  오늘은 반 공통 숙제 안내만 확인해 주세요.
                </div>
              )}
            </div>

            {notice.homeworkHistory?.length > 0 && (
              <div className="panel" style={{ marginTop: "16px" }}>
                <div className="panel-head">📅 숙제 날짜 선택</div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    overflowX: "auto",
                    paddingBottom: "4px"
                  }}
                >
                  {notice.homeworkHistory.map((item) => (
                    <button
                      key={item.date}
                      type="button"
                      onClick={() => setSelectedDate(item.date)}
                      style={{
                        flex: "0 0 auto",
                        border:
                          selectedDate === item.date
                            ? "2px solid #2563eb"
                            : "1px solid #e5e7eb",
                        background:
                          selectedDate === item.date ? "#eff6ff" : "#ffffff",
                        borderRadius: "999px",
                        padding: "10px 14px",
                        fontSize: "14px",
                        fontWeight: 900,
                        color:
                          selectedDate === item.date ? "#1d4ed8" : "#374151"
                      }}
                    >
                      {dateButtonLabel(item.date)}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: "10px",
                    fontSize: "13px",
                    color: "#6b7280",
                    lineHeight: 1.5
                  }}
                >
                  최근 7일 동안 저장된 숙제를 확인할 수 있습니다.
                </div>
              </div>
            )}

            {!selectedHomework?.homework ? (
              <div className="error-box">
                선택한 날짜에 등록된 숙제가 없습니다. 학원에서 순차적으로 업데이트 중입니다.
              </div>
            ) : (
              <div>
                <div
                  style={{
                    margin: "18px 2px 10px",
                    fontSize: "15px",
                    fontWeight: 900,
                    color: "#374151"
                  }}
                >
                  📌 {formatDateLabel(selectedHomework.date)} 숙제 안내
                </div>

                <SectionCard icon="✅" tone="blue" title="지난 숙제">
                  {selectedHomework.homework.previous || "-"}
                </SectionCard>

                <SectionCard icon="📣" tone="rose" title="전달사항">
                  {selectedHomework.homework.notice || "-"}
                </SectionCard>

                <SectionCard icon="📘" tone="yellow" title="오늘의 수업">
                  {selectedHomework.homework.todayClass || "-"}
                </SectionCard>

                <SectionCard icon="📝" tone="orange" title="오늘의 숙제">
                  {selectedHomework.homework.homework || "-"}
                </SectionCard>

                <SectionCard icon="✨" tone="green" title="온라인 숙제">
                  {selectedHomework.homework.online || "-"}
                </SectionCard>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
