# 내부 benchmark 파이프라인

`bomti_benchmark_v1`은 브라우저나 관리자 route가 아닌 server-only CLI에서만 다룬다. 로컬 fixture는 명확히 synthetic인 세 쌍뿐이며, 운영자 검수 데이터는 저장소에 만들거나 수정하지 않는다.

```powershell
npm run benchmark:validate -- --profile=three-synthetic-operator-absent --out=C:\private\tmp\benchmark\validate --sha=<commit-sha>
npm run benchmark:pair -- --profile=synthetic-anonymous-group --out=C:\private\tmp\benchmark\pair --sha=<commit-sha>
npm run benchmark:import -- --profile=synthetic-contract-only --out=C:\private\tmp\benchmark\import --sha=<commit-sha>
npm run benchmark:export -- --profile=synthetic-eligible --format=json,csv --out=C:\private\tmp\benchmark\export --sha=<commit-sha>
npm run benchmark:report -- --profile=majority-tie-abstain-missing --out=C:\private\tmp\benchmark\report --sha=<commit-sha>
```

별도로 전달된 20~30개 `pending_review` 운영자 corpus는 `benchmark:validate`에 `--input=<file>`로만 검증한다. `benchmark:pair --profile=eligible-live`와 `benchmark:import --profile=operator-reviewed`는 명시적 입력이 없으면 성공으로 위장하지 않고 SHA-bound `operator_not_supplied` 영수증을 남긴다. Import는 `reviewed` 상태의 20~30개 쌍만 수락한다.

`benchmark:curate -- --profile=pending-review-contract --input=<file>`는 제공된 `pending_review` corpus의 개수와 익명 계약만 검증해 offline curation manifest를 작성한다. 이 명령은 어떤 운영자 record도 만들거나 승인하거나 수정하지 않는다.

Export는 JSON 및 CSV를 함께 요구하고, 익명 record/group/rater ID를 export마다 새로 매핑한다. 허용된 benchmark 필드만 내보내며 owner, account, evaluation, raw input, provider secret, context hash, relink key는 schema와 export 양쪽에서 거부한다.
