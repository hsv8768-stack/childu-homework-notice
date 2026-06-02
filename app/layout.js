import "./globals.css";

export const metadata = {
  title: "차일드유 숙제 안내장",
  description: "우리 아이의 오늘 학습 안내를 정리해두었습니다."
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
