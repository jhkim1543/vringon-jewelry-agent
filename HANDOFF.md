# VRINGON Jewelry Agent 인수인계

새 대화창에 이 문서를 그대로 붙여넣고 "이어서 진행해줘"라고 말하면 됩니다.

---

## 0. 먼저 읽을 것

작업 폴더는 `C:\Users\rebui\Downloads\local_handoff\local_handoff\vringon-jewelry` 입니다.
주얼리 전용 제품이고, 신발과 분리된 별도 저장소입니다. 이 폴더 안에서만 작업하세요.

| 항목 | 값 |
| --- | --- |
| 저장소 | https://github.com/jhkim1543/vringon-jewelry-agent |
| 데모 | https://jhkim1543.github.io/vringon-jewelry-agent/ |
| 스택 | Vite + React 18 + TypeScript, @xyflow/react 12, three.js 0.185 |
| 개발 서버 | `npm run dev` (Vite 미들웨어가 API 프록시 역할) |
| 배포 | `npm run build:pages` 로 `docs/` 생성 → 커밋 → GitHub Actions |
| 신발 제품 | `../vringon-shoe`, 데모 https://jhkim1543.github.io/vringon-design-agent/ |

### 절대 어기면 안 되는 보안 규칙

1. API 키는 `vringon-jewelry/.env` 에만 둡니다. 이 파일은 gitignore 되어 있고 절대 커밋하지 않습니다.
2. 키에 `VITE_` 접두사를 붙이지 않습니다. 붙이는 순간 브라우저 번들에 들어갑니다. 키는 `server/*.mjs` 쪽에서만 읽습니다.
3. 푸시 전에 스테이징된 파일을 반드시 스캔하고 결과가 0이어야 합니다.

```bash
git add -A && git diff --cached --name-only -z | xargs -0 -I{} sh -c 'grep -IlE "sk[-]proj-|sk[-]ant-|gho[_]|ghp[_]|github[_]pat_|AIza[0-9A-Za-z_-]{30}|tsk[_][0-9a-f]{16}" "{}" 2>/dev/null' | wc -l
```

패턴의 일부를 `sk[-]proj-` 처럼 문자 클래스로 쪼개 둔 이유가 있습니다. 정규식으로는 동일하게 동작하지만, 이 문서 자체가 스캔에 걸리지 않게 하려는 것입니다. 그냥 적으면 이 저장소의 스캔 결과가 영원히 1이 되어 진짜 유출을 구분하지 못하게 됩니다.

`.env` 에 들어 있는 키 이름: OPENAI_API_KEY, OPENAI_DEEP_RESEARCH_KEY, OPENAI_DEEP_RESEARCH, OPENAI_DEEP_RESEARCH_MODEL, OPENAI_REASONING_MODEL, MIRO_ACCESS_TOKEN, GEMINI_API_KEY, TRIPO_API_KEY.

---

## 1. 지금까지 완료된 것

**제품 구조**
3단계 위저드로 재설계했습니다. 2단계 첫 질문이 "어떤 라인인가"이고, 금속(925 은/14K/18K/골드필드/도금황동), 코팅, 스톤(무/CZ/랩다이아/천연다이아/루비/사파이어/진주/크리스탈)이 서로 독립된 축입니다. 프리셋 7개는 카테고리가 아니라 이 세 축을 미리 채워 주는 번들입니다. 이 라인 프로필이 조사 프롬프트, 경쟁사 분류, 디자인 생성, 리포트까지 전 과정을 관통합니다.

**파이프라인** S1 조사 → S2 신호 → S3 스케치와 디자인 변형 → S4 캠페인 컷 → S5 3D. S5는 이미지에서 정면·좌·후·우 4면 정투영 뷰를 먼저 만들고 그 4장을 Tripo `multiview_to_model` 에 넣습니다. GLB 다운로드 가능합니다.

**리포트** 근거 시즌(FW26)에서 다음 시즌(SS27)을 예측하는 구조입니다. 매크로트렌드마다 등급과 확신도, 다음 시즌 콜이 붙고, 팔레트는 Metal/Gemstone/Diamond/Pearl/Mood 레이어로 나뉩니다. 경쟁사는 Direct/Aspirational/Directional 로 자동 분류됩니다. 디자인마다 실제 사용된 프롬프트가 저장되어 리포트에 나옵니다.

**보드** Miro 스타일로 재설계했습니다. 9개 레인, 경쟁사 제품 사진 카드, 클릭 배치, 삭제, 줌 표시. 3D 카드는 클릭하면 뷰어가 열립니다(WebGL 컨텍스트 한계 때문에 인라인이 아니라 클릭 방식).

**Miro 연결** 사용자마다 자기 계정 토큰을 씁니다. 내보내기 첫 클릭에 안내 다이얼로그가 뜨고, 토큰은 그 브라우저 localStorage 에만 저장되어 요청마다 실려 갑니다. 서버는 중계만 하고 저장하지 않습니다. `.env` 의 MIRO_ACCESS_TOKEN 은 폴백입니다.

**언어** 한국어/일본어/영어. 화면뿐 아니라 조사 결과물의 언어도 선택한 언어를 따릅니다.

**접근성** 다크/라이트 두 테마, 세 언어 전부에서 대비 위반 0건을 DOM 계산 스타일로 감사해 확인했습니다.

**품질 감사 스크립트** `scripts/quality-audit.mjs`. 완료된 분석 JSON을 압축해 Gemini에게 상품기획 심사위원 관점으로 평가시킵니다.

```bash
node scripts/quality-audit.mjs src/samples/sample_jewel_labdiamond.json
```

1회 실행 결과 8/10 이었고, 실제 결함 하나를 잡았습니다. 경쟁사 가격이 6개 전부 0원이라 보드에 "KRW 0k"로 찍히고 있었습니다. 조사 프롬프트에 공식몰 정가 확인을 강제하고 가격 미확인 제품은 제외하도록 고쳤습니다.

---

## 2. 남은 작업 (우선순위 순)

### P0. Pages 배포 (해결됨, 재발 시 대응법)

한 번 깨졌다가 고쳤습니다. 지금은 정상이고 GLB가 200으로 응답합니다.

무슨 일이었나: `docs/` 에 15MB GLB가 들어간 순간부터 `actions/deploy-pages@v4` 가 `deployment_in_progress` 상태로 10분을 넘겨 "Timeout reached, aborting!" 로 중단됐습니다. 직전 커밋(354036b)까지는 성공했으니 페이로드 크기가 원인이었습니다. `.github/workflows/pages.yml` 의 `timeout` 을 2400000, `error_count` 를 60으로 올려 해결했습니다.

재발하거나 3D 모델을 더 얹어 다시 느려지면, 근본 해결은 GLB 용량 축소입니다. 대부분 텍스처입니다.
`npx @gltf-transform/cli optimize --texture-compress webp` 는 이 환경의 sharp/vips 에서 `colourspace: parameter space not set` 로 실패했습니다. 대안은 GLB에서 텍스처를 꺼내 sharp로 직접 webp 변환 후 되넣기, 또는 Draco 압축(단 three.js DRACOLoader 디코더 파일을 번들에 포함해야 함)입니다.

배포 확인 명령:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://jhkim1543.github.io/vringon-jewelry-agent/samples/f9aaa1b99575077957e92a2d.glb
```

### P1. Gemini 품질 감사 반복 — 완료 (2026-08-07)

총 4회가 채워졌습니다: 랩다이아 링 S5(8/10, 이전 세션) + 진주 펜던트 S3(8/10) + 랩다이아 뱅글 S2(7/10) + 랩다이아 스터드 S5·3D(8/10).
새 3회는 `sample_jewel_pearlpendant` / `qa_bangle_labdiamond_s2` / `sample_jewel_studdiamond` 로 저장소에 있고,
앞뒤 2개는 데모 History에도 노출됩니다(`sampleRun.ts`의 SAMPLE_IDS).

감사 지적 반영 내역 (전부 `pipeline.ts`/`packs.ts`):
1. 신호 키워드 → 프롬프트 강제 삽입 — S1에서 신호가 확정되는 즉시 trendClause.signals에 실려 스케치·렌더 프롬프트에 들어갑니다. 도시에는 늦게 와도 덮어쓰지 않고 병합됩니다.
2. TCW 가드레일 — 라운드 브릴리언트 근사 0.0061×d³로 총캐럿을 계산해 상한 초과 시 스톤 지름을 줄이고 `tcw_ct`를 기록합니다.
3. 라인-스펙 잠금 — baseMetal/coating이 스펙 생성의 metal/plating을 잠급니다 (925 라인에 brass 혼입 방지).
4. 단석 채널·파베 금지(J 공법 오류), Signature 단석 3.8mm 하한, 멀티스톤 보조석 2mm 경고·3mm 탈락(J-11).

미반영(낮은 우선순위): 포스트 게이지(0.8/1.0/1.2mm) UI 구분, 실버+VVS 오버스펙 경고 룰.

### P2. 전문가 설정 — 대부분 완료 (2026-08-07)

위저드 2단계 라인 섹션의 접히는 "전문가 설정" 박스: 도금 두께 μm, 다이아 4Cs, 진주 7요소, TCW 상한, 컴플라이언스(니켈/카드뮴/납, 다중 선택).
라인 프로필에 따라 노출이 갈립니다(무스톤이면 4Cs·진주·TCW 숨김). 값은 `metalProgramOf`/`stoneProgramOf` 프로그램 문자열에 접혀
조사 프롬프트·캐시 키·이미지 프롬프트(`linePromptClause`)가 함께 갈라집니다 — **캐시 키 버전을 따로 올릴 필요가 없는 구조**입니다.
남은 것: 세팅 방식·구조를 라인 차원에서 강제하는 옵션.

### P3. PDF 역할 분리 — 부분 완료

완료: 근거 ID 체계(`evidenceId()` — sg_001.e1 / cp_2.e1 / ds.e3 / rp.e2, 파생식이라 옛 저장본 무수정), 화면(신호 표·카드·경쟁사 링크)과
두 PDF의 SOURCES 표가 이 ID로 인용. 리포트 표지에 조사 지문(라인 프로그램·모드·수집일), 관측 경쟁 제품 사진 슬라이드(OBSERVED),
디자인 갤러리 슬라이드(ANSWERED) 추가. 출처 수는 배열 길이에서 파생되므로 표지-부록 불일치가 구조적으로 불가능합니다.
남은 것: 본문 개별 주장 단위의 evidence_id 인용(조사 스키마에 주장→근거 매핑 추가 필요, 캐시 키 승격 동반), 10~14p/18~24p 분량 재배분.

### P4. 나머지 사양

판매 순위와 베스트셀러 소속의 분리, 마켓플레이스/리테일러 스냅샷, 후보별 중량/COGS/마진 판정, Core-Push-Signature 티어를 근거 등급과 연결, 제품군별 동적 필드(귀걸이 포스트 게이지, 반지 사이즈 범위 등).

### P5. 인프라

H100 서버에 `server.mjs` 배포. 이게 있어야 기기 간 보드 공유, 실시간 동시 열람, Miro OAuth 정식 연동이 가능합니다. 현재 공유는 링크 직렬화 방식이라 같은 브라우저 범위를 벗어나지 못합니다.

신발 저장소 정리는 끝났습니다 (2026-08-07). `../fashion-agent`(= vringon-design-agent)의 신발 전용 개편이 5d4936b로
커밋·배포되어 주얼리 코드·샘플이 전부 빠졌고, 라이브 번들에서 Footwear 내용이 확인됩니다.

---

### 2차 개편 (2026-08-07 사용자 피드백 반영)

- **백화점 베스트셀러 조사**: `researchBestsellers`(research-api.mjs, best2 키)가 롯데·SSG·더현대 + Harrods·Selfridges·Saks·
  Net-a-Porter 등에서 "베스트셀러로 표기된" 제품을 순위 인용과 함께 수집한다. comp8 키의 경쟁 조사와 병렬로 돌고,
  실패해도 경쟁 조사를 막지 않는다. 사진은 `/api/shot`이 직링크 실패 시 상품 페이지(여러 개 가능, p 반복 파라미터)의
  og:image로 폴백해 가져온다 — Harrods는 뚫리고 NAP·Selfridges는 봇 차단이라 칩 플레이스홀더가 나온다.
  노출: 보드 research 레인 사진 카드(r-best, bs-N) · 분석 화면 "백화점 베스트셀러" 패널(defaultOpen) ·
  리포트 PDF "SELLING NOW" 슬라이드 · 도시에 PDF "OBSERVED MARKET" 슬라이드(예측 앞).
- **스케치→디자인 단계 분리**: S2 = 기준 잉크 스케치 + 같은 외형의 흑백 변형(`sketchVariantPrompt`, view `sketch_var`),
  S3 = 각 스케치를 `colorizePrompt`로 editImage 컬러화(기하 유지). 모든 디자인이 자기 스케치로 추적된다(editedFrom).
  예산이 빠듯하면 변형이 S3 몫(reserveS3)에 양보한다 — 스케치 6장×2변형이면 예산 12를 다 먹어 S3가 통째로 굶는 사고가 실제로 났다.
- **보드 카드·칸 리사이즈**: 카드를 선택하면 모서리 8핸들로 늘리고 줄인다(NodeResizer). 크기는 BoardEdits.sizes에
  런별 저장되고 연결선 핸들도 저장된 크기를 따라간다. Reset edits가 크기도 되돌린다.

### 보드 레이아웃 · 좌표는 계산해서 만든다

카드 높이는 76px부터 430px까지 벌어진다(사진 한 장이 220px). `row × 고정간격`으로 두면
반드시 겹친다 — 실제로 겹쳐 있었다. `measureCard()`가 글이 몇 줄로 접히는지까지 재고
(**한글은 폭이 2배라 글자 수가 아니라 폭으로 세야 한다**), 컬럼별로 그 높이를 쌓아 내린다.
`buildBoardModel`의 `row` 값은 **순서만** 정하고 좌표는 Board.tsx가 만든다. 카드를 추가할 때
row를 촘촘히 줘도 겹치지 않는다. 검증: 48~53장 보드에서 겹침 0, 카드 내용 넘침 0.

### 조사→디자인 연결 감사

`node scripts/audit-linkage.mjs [파일...]` — "데이터를 모았다"와 "그 데이터가 디자인을 바꿨다"는
다른 이야기다. 신호가 실제 이미지 프롬프트에 들어갔는지, 라인·전문가 설정이 관통했는지,
컬러 디자인이 스케치까지 추적되는지(**사슬을 끝까지 따라간다** — 추가 뷰는 기준 렌더에서
파생되므로 한 칸만 보면 안 된다), 근거 체인이 실존 신호를 가리키는지를 센다.

현재 기준선(신규 샘플 2건): 신호→프롬프트 57%(상위 4개만 주입하는 설계), 라인→프롬프트 63%
(각도 변경 편집엔 라인 절이 불필요), 전문가값 100%, 디자인←스케치 100%, 근거체인 100%,
경쟁가격 100%, 제품사진 100%. **옛 샘플 3종(hoop/ring/labdiamond)은 개선 이전 산물이라
신호·라인 0%다** — SAMPLE_IDS에서 뒤로 밀어 뒀고, 비교용으로만 남긴다.

### 제품 사진 · 굽기와 유료 언블로커

**현재 커버리지: 46개 중 45개(97.8%)** — Bright Data Web Unlocker(존 `web_unlocker1`) 연결 후 실측.
유료 연결 전에는 88%였고, 막히던 사이트(Pandora 랩그로운, Net-a-Porter, Selfridges)가 전부 뚫렸다.
남은 1건은 Pandora 상품 URL이 PAGE NOT FOUND인 경우다 — 죽은 링크라 프록시로 해결되지 않는다.
사진을 못 구한 카드는 남의 사진을 빌리지 않고 텍스트 카드로 둔다.

**굽기**: `scripts/bake-shots.mjs`가 샘플의 제품 사진을 지금 내려받아 `/samples/shot_*.webp`로 저장하고
image_urls[0]을 로컬 경로로 바꾼다. 배포본은 정적이라 `/api/shot` 프록시가 없다 — **굽지 않으면 배포 데모에
조사 사진이 하나도 안 뜬다.** 샘플을 새로 뜰 때마다 반드시 다시 돌릴 것.

**유료 언블로커** (`server/unlock.mjs`, 선택): 설계 원칙 세 가지.
1. **무료가 실패한 건에만** 유료 경로를 태운다. 잘 되던 사이트는 계속 공짜다.
2. 성공당 과금 서비스를 기본으로 잡아, 막힌 요청은 돈이 안 나간다.
3. `UNLOCKER_DAILY_CAP`(기본 300)으로 하루 상한. 사용량은 `.cache/unlocker-usage.json`과
   `/api/status`의 `unlocker.usage`에서 본다.

켜는 법은 `.env.example`의 UNLOCKER 블록 참고. 두 방식을 지원한다.
- `UNLOCKER_PROVIDER=brightdata` + `UNLOCKER_KEY` + `UNLOCKER_ZONE` (건당 과금, 소량이면 가장 싸다)
- `UNLOCKER_URL=…?api_key=<키>&url={url}` (ScrapingBee·ScraperAPI·ZenRows 등 월 구독형이 전부 이 모양)

**주의 1**: `.env` 값은 `process.env`로 올라가지 않는다(키를 브라우저 번들에서 떼어 놓는 구조).
그래서 `configureUnlocker(env)`를 반드시 호출해야 한다 — openai-api.mjs와 bake-shots.mjs가 각각 부른다.

**헤드리스 검증의 한계** (버그로 오해하기 쉽다): 브라우저 창이 화면에 없으면 페이지가
`visibilityState: hidden`이라 requestAnimationFrame이 멈춘다. 그래서 **전체 보기(fitView)·
발표 모드 이동·lazy 이미지·WebGL(3D) 캔버스가 "안 되는 것처럼" 보인다.** 실제 브라우저에서는 정상이다.
이미지는 `loading='eager'`로 바꿔 강제 로드하면 검증되고, 3D는 GLB URL이 200인지로 확인한다.
**PDF 버튼은 헤드리스에서 절대 클릭하지 말 것** — iframe의 `print()`가 렌더러를 통째로 멈춘다(복구: 탭 닫기).

**주의 2 · Bright Data 설정 함정** (실제로 세 번 헤맸다):
- 존은 **Web Access API → Create API → Web Unlocker**에서 만든다. `Proxy Infrastructure`의 Residential/Datacenter/ISP는
  IP만 주는 다른 제품이라 봇 차단을 못 뚫는다.
- 존 생성에는 **Admin 권한 API 키**가 필요하다. 기본 발급 키는 `User` 권한이라 `POST /zone`이 403이다.
  키는 `.env`에 상주하므로 권한을 올리지 말고 대시보드에서 존을 만드는 편이 안전하다(요청 실행만 되면 충분하다).
- `/status`가 `can_make_requests:false, zone_not_found`라고 해도 무시해도 된다. 실제 `/request` 호출은 정상 동작한다.

**이미지 추출기** `findProductImage(html, pageUrl)`(unlock.mjs): og:image만 보면 안 된다.
Net-a-Porter는 `srcset`에 `//host/...`(프로토콜 생략)로 준다. 패턴별로 **모든 매치를 순회**해야 한다 —
첫 매치가 로고라고 그 패턴을 통째로 버리면 진짜 사진을 놓친다(실제로 그 버그가 있었다).

이미 한 번씩 크게 시간을 잃은 것들입니다.

**실행 중에 `server/*.mjs` 를 수정하지 마세요.** Vite가 재시작하면서 진행 중인 조사 요청이 통째로 죽습니다. 예측 리포트 생성을 두 번 날렸습니다. 파이프라인이 도는 동안 서버 파일은 동결하세요.

**bash에서 `node -e` 안에 `${...}`, 백틱, 정규식을 넣지 마세요.** 이스케이프가 반복적으로 깨집니다. 스크래치패드에 `.cjs` 파일을 쓰고 실행하는 방식이 확실합니다.

**`npm run build:pages` 는 반드시 이 스크립트를 그대로 쓰세요.** 과거에 `.nojekyll` 을 넣으려고 고치다가 `BUILD_TARGET=pages` 가 빠져서 계속 `dist/` 로만 빌드되고 `docs/` 는 옛것이 남았습니다. 배포본에 최신 개선이 하나도 반영되지 않던 원인이었습니다. 빌드 후 `ls docs/samples/*.glb` 로 확인하는 습관을 들이세요.

**Pages 레거시 빌더(Jekyll 경로)는 원인 표기 없이 실패합니다.** 그래서 Actions 워크플로 방식으로 전환했습니다. 되돌리지 마세요.

**조사 프롬프트를 바꾸면 캐시 키를 반드시 올리세요.** `server/research-api.mjs` 와 `server/dossier-api.mjs` 안에 `comp6`, `brand5`, `trend6`, `dossier5-line` 같은 문자열이 있습니다. 안 올리면 옛 결과가 그대로 나와서 고친 게 반영되지 않은 것처럼 보입니다.

**위저드 3단계를 건드리지 않으면 S3까지만 돕니다.** 기본값 함정입니다. 전체 사이클을 돌리려면 종료 단계를 명시적으로 S5로 지정하세요.

**Tripo 슬롯 순서는 `[front, left, back, right]` 입니다.** 다른 순서로 넣으면 3D가 뒤틀립니다.

**글로 나가는 모든 산출물에서 `-`, `##`, `**` 기호를 쓰지 않습니다.** `tidyProse()` 가 걸러 주지만 새 프롬프트를 추가할 때도 이 규칙을 프롬프트에 명시하세요.

---

## 4. 새 대화에서 첫 명령으로 쓸 문장

아래를 그대로 쓰면 됩니다.

> 위 인수인계 문서대로 이어서 진행해줘. P1(Gemini 품질 감사 3회 추가 실행과 지적사항 반영)부터 시작하고 P2, P3 순서로 진행해줘. 보안 규칙과 함정 항목은 반드시 지켜줘.
