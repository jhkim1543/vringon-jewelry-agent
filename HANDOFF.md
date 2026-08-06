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
git add -A && git diff --cached --name-only -z | xargs -0 -I{} sh -c 'grep -IlE "sk-proj-|sk-ant-|gho_|ghp_|github_pat_|AIza[0-9A-Za-z_-]{30}|tsk_[0-9a-f]{16}" "{}" 2>/dev/null' | wc -l
```

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

### P1. Gemini 품질 감사 반복 (여기부터 시작하세요)

사용자가 요청한 "랜덤 카테고리 4회, 서로 다른 단계까지 실행 후 Gemini 평가와 반영"은 1회만 수행되었습니다. 남은 3회를 돌려야 합니다.

방법: 서로 다른 라인 프로필(예: 925 은 무스톤 / 14K 천연다이아 / 골드베르메유 진주)과 서로 다른 종료 단계(S2, S3, S5)로 실행 → 내역에 저장 → 각 결과 JSON에 `scripts/quality-audit.mjs` 실행 → 지적사항 반영.

이미 접수되어 있으나 미반영인 Gemini 지적:
1. 신호에서 뽑힌 키워드(예: 인사이드아웃 세팅, 타원 실루엣)가 실제 디자인 프롬프트에 명시되지 않습니다. S3 프롬프트 생성 시 상위 신호 키워드를 강제 삽입해야 합니다.
2. TCW(총캐럿중량) 제한 필드가 없어 소재 대비 스톤 비중의 생산 적합성을 검증하지 못합니다.

### P2. 전문가 설정

도금 두께(μm), 다이아 4C, 진주 7요소, 세팅 방식, 구조, 컴플라이언스(니켈/카드뮴/납 규제). 위저드 3단계에 접히는 고급 설정으로 넣고, 라인 프로필에 따라 노출 항목이 달라져야 합니다. 예를 들어 스톤이 `none` 이면 4C 블록은 숨깁니다.

### P3. PDF 역할 분리

현재 리포트 하나로 되어 있습니다. 두 개로 나눠야 합니다.
근거 리포트 10~14페이지(관측된 사실만, 주장마다 evidence_id), 예측 리포트 18~24페이지(다음 시즌 해석과 제안). 표지의 출처 수와 부록의 실제 출처 수가 일치하는지 검증하는 단계도 필요합니다.

### P4. 나머지 사양

판매 순위와 베스트셀러 소속의 분리, 마켓플레이스/리테일러 스냅샷, 후보별 중량/COGS/마진 판정, Core-Push-Signature 티어를 근거 등급과 연결, 제품군별 동적 필드(귀걸이 포스트 게이지, 반지 사이즈 범위 등).

### P5. 인프라

H100 서버에 `server.mjs` 배포. 이게 있어야 기기 간 보드 공유, 실시간 동시 열람, Miro OAuth 정식 연동이 가능합니다. 현재 공유는 링크 직렬화 방식이라 같은 브라우저 범위를 벗어나지 못합니다.

신발 저장소 정리도 남아 있습니다. `../vringon-shoe` 는 존재하지만 `vringon-design-agent` 저장소가 아직 신발과 주얼리가 섞인 상태입니다.

---

## 3. 반드시 알아야 할 함정

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
