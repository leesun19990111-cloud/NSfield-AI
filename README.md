# NS Field — 파기됨 (2026-09-07)

이 프로젝트는 **중단·파기**되었습니다. 앱·API 코드, DB 스키마, 배포 설정, 크론 워크플로는
모두 저장소에서 제거했습니다. 남아 있는 것은 설계 문서(`docs/`)와 화면 목업(`mockups/`)뿐이며,
이 저장소만으로는 어떤 API도 동작하지 않습니다.

과거 코드는 git 이력(`git log`)에 남아 있습니다.

## 저장소 밖에서 소유주가 직접 폐기해야 하는 것

| 항목 | 위치 | 할 일 |
| --- | --- | --- |
| Vercel 프로젝트 | vercel.com | 프로젝트 삭제 (환경변수의 실제 키도 함께 사라짐) |
| Supabase 프로젝트 | supabase.com | 프로젝트 삭제 또는 일시정지. 사용자·지갑 원장·저장소 포함 |
| AtlasCloud API 키 | console.atlascloud.ai | 키 폐기(revoke) |
| OpenAI API 키 | platform.openai.com | 키 폐기 |
| Google OAuth 클라이언트 | Google Cloud Console | 클라이언트 삭제 |
| GitHub repo secrets | 이 저장소 Settings → Secrets | `PROD_SITE_URL`, `CRON_SECRET` 삭제 |
| GitHub 저장소 | 이 저장소 Settings | 보관(archive) 또는 삭제 |
