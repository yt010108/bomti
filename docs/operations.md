# 운영 준비와 복구

이 문서는 운영 절차를 설명할 뿐, 이 저장소에서 외부 Supabase 프로젝트·Vercel 프로젝트·OAuth 제공자를 호출하거나 변경하는 권한을 주지 않는다. 외부 복구와 배포는 별도로 권한을 받은 운영자가 수행한다.

## 준비 상태와 즉시 중지

`GET /api/health`는 비밀값 없이 `status`, `ready`, `code`를 반환한다.

- `BOMTI_OPERATIONS_PAUSED=true`: 서비스가 `paused`와 `SERVICE_PAUSED`를 반환한다.
- `BOMTI_DISABLE_EVALUATIONS=true`: 서비스는 읽기 가능한 `degraded` 상태를 유지하지만 새 평가를 받지 않는다.
- `SUPABASE_URL` 또는 `SUPABASE_ANON_KEY`가 없으면 `not_ready`로 실패 종료한다. 값 자체는 응답·로그·영수증에 남기지 않는다.
- `BOMTI_API_TEST_MODE=true`은 격리된 테스트 전용이다. 운영 환경에 설정하지 않는다.

## 로컬 복구 검증

다음은 Docker와 로컬 Supabase/Postgres가 있는 격리 워크스페이스에서만 실행한다. 출력은 SHA가 지정된 영수증으로 남기며, DB를 시작하지 못하면 PASS가 아니라 `blocked` 또는 `fail`을 반환한다.

```powershell
npm run verify:ops -- --profile=link-free-vercel-migration-backup-restore --out=C:\private\tmp\bomti-ops --sha=<commit-sha>
npm run verify:ops -- --profile=paused-db-missing-model-disabled-budget-expired-oauth-provider429-corrupt-backup --out=C:\private\tmp\bomti-ops-degraded --sha=<commit-sha>
npm run verify:live -- --profile=authorization-state --out=C:\private\tmp\bomti-live --sha=<commit-sha>
```

첫 프로필은 고정된 로컬 Vercel CLI build를 임시 작업공간에서 실행한다. 링크·로그인·pull·deploy는 하지 않고, 네트워크 guard가 DNS 및 non-loopback 연결이 0회인지 확인한다. 이어서 `supabase db reset`으로 migration을 적용하고, 로컬 Postgres에서 down/up schema hash와 AES-256-GCM 백업의 복원·태그 변조 거부를 확인한다. Windows에서 Vercel 산출물의 중복 함수 링크 권한이 없으면 임시 산출물 안에서만 동일 파일 복사로 대체한다.

## 외부 프로젝트 복구

Free Supabase 프로젝트는 저활동 7일 후 자동 일시중지될 수 있고, 재개는 권한 있는 운영자가 Dashboard에서 수행한다. 따라서 애플리케이션은 외부 프로젝트를 깨우기 위한 ping이나 자동 복구 요청을 보내지 않는다. API가 일시중지 상태를 보이면 평가를 막고 운영자에게 넘긴다. 복구 전에 제공자의 최신 정책·보존 기간·백업 가능 여부를 확인한다.

- [Supabase 프로젝트 일시중지](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase 운영 전 점검 목록](https://supabase.com/docs/guides/deployment/going-into-prod)

Vercel Hobby는 개인·소규모 용도의 무료 플랜이며 사용량과 공정 사용 제한이 있다. 이 저장소의 검증은 Vercel 배포·링크·인증을 수행하지 않으므로, 실제 배포 승인과 사용량 검토는 별도 운영 절차다.

- [Vercel Hobby 플랜과 제한](https://vercel.com/docs/plans/hobby)

## 비밀값과 백업

백업 암호화 키, Supabase 키, OAuth 비밀값, provider 토큰은 저장소·테스트 영수증·PR 본문에 넣지 않는다. 암호화 백업은 `BOMTI-BACKUP-V1`의 AES-256-GCM 형식을 사용하며, 인증 태그가 변조되면 복원을 거부한다. 실제 외부 백업 복원은 별도 승인과 키 관리 절차가 있는 운영자만 수행한다.
