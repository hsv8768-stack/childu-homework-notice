import { kv } from "@vercel/kv";

const HISTORY_DAYS = 7;
const TTL_SECONDS = 60 * 60 * 24 * 8;

function safeLevelKey(level) {
  return encodeURIComponent(String(level || "").trim());
}

function historyKey(level, date) {
  return `childu:homework:${safeLevelKey(level)}:${date}`;
}

function parseIsoDate(dateString) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return new Date();
  }

  const [, year, month, day] = match;

  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day))
  );
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function recentDates(targetDate, count = HISTORY_DAYS) {
  const base = parseIsoDate(targetDate);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(base);
    date.setUTCDate(base.getUTCDate() - index);
    return formatIsoDate(date);
  });
}

export async function saveHomeworkSnapshot(level, date, homework) {
  if (!level || !date || !homework) return;

  try {
    await kv.set(
      historyKey(level, date),
      {
        date,
        homework
      },
      {
        ex: TTL_SECONDS
      }
    );
  } catch (error) {
    console.error("Failed to save homework history:", error);
  }
}

export async function getHomeworkHistory(level, targetDate) {
  if (!level) return [];

  const dates = recentDates(targetDate, HISTORY_DAYS);

  try {
    const items = await Promise.all(
      dates.map(async (date) => {
        const saved = await kv.get(historyKey(level, date));

        if (!saved) return null;

        return {
          date,
          homework: saved.homework || saved
        };
      })
    );

    return items.filter(Boolean);
  } catch (error) {
    console.error("Failed to load homework history:", error);
    return [];
  }
}
