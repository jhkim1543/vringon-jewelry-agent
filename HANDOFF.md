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

### 세 모드 모두 업로드를 실제로 읽는다 (2026-08-08)

시리즈·무드보드는 **껍데기였다.** 위저드가 `e.target.files[].name` 만 남기고 File 을 버려서,
파이프라인은 "Reading your series" 를 찍으면서 고정 샘플을 내보냈다. 브랜드가 무엇을 올려도 결과가 같았다.

- 업로드는 `.cache/uploads` 에 두고 **해시로만** 오간다 (`server/uploads-api.mjs`).
  base64 를 localStorage 에 넣으면 PDF 한 개에 바로 용량이 터진다. `readBody` 는 업로드 경로만 60MB 로 연다.
- 시리즈: 이미지를 비전으로 읽어 invariant/variable/**ambiguous** 를 `observed_in / of` 로 센다.
  브랜드 가치 문장은 `brand_claim_check` 로 대조하고 **브랜드 편을 들지 않는다**.
- 무드보드: PDF 를 직접 읽고 **page_ref 없는 신호는 버린다**. 문서의 편향(`source_perspective`)과
  못 답하는 범위(`coverage_note`)를 함께 낸다. 문서 속 지시문은 데이터로만 취급한다.
- 옛 저장본 호환: `archiveFiles`/`files` 는 `(string | UploadRef)[]`. 문자열만 있던 시절 것은 내용이 없어
  읽을 수 없고, 그 경우 "sample data" 라고 로그에 밝힌다. `uploadRefs()` / `uploadName()` 로 접근할 것.
- **올린 것을 되돌려 보여준다**: `/api/upload/file/<hash>` 가 원본을 서빙하고, 보드 조사 레인이
  사진 카드로 건다(`uploadImages()`). save-sample 이 `/samples/up_<hash>.<ext>` 로 굳혀 데모에서도 남는다.
- **PDF 페이지 그림**: 업로드 시 브라우저에서 pdf.js 로 앞 8쪽을 webp 로 떠 함께 올린다.
  판독은 원본 PDF(`input_file`)로 인용하고, 페이지 그림(`input_image`)은 도판을 보게 한다.
  **함정**: JPEG2000 을 품은 PDF 는 wasm 이 없으면 *실패가 아니라 멈춘다* — 업로드가 통째로 막혔다.
  그래서 `public/pdfjs/` 로 wasm·cmaps 를 서빙하고, 전체 45초·페이지당 12초로 시간을 끊는다.
  페이지 그림은 덤이라 실패해도 업로드와 판독은 그대로 간다.

실측(2026-08-08): 실제 커프 사진 11장 + "무광 실버, 스톤 없음" 주장 → `agrees:false`,
"9/11 골드, 스톤 6장, 업로드에 반지·체인 팔찌가 섞임". 실제 트렌드 PDF → 신호 8개 전부 p.1~p.3 근거,
팔레트 6색, 발행처의 감정평가 이해관계 지적, "후프 언급 없음" 고지.

### 데모 샘플은 모드당 한 건

`SAMPLE_IDS` = vermeilhoop(트렌드 풀사이클+3D+예측근거이미지) / mode_series / mode_moodboard.
`node scripts/prune-samples.mjs <남길것...> --go` 가 나머지 JSON 과 **고아 미디어까지** 지운다
(정리 때 69MB 회수). 샘플을 새로 뜨면 bake-shots → prune 순서로 돌릴 것.

**함정 · 샘플을 손댄 뒤에는 `node scripts/check-wizard-art.mjs` 를 돌릴 것.** 위저드 마지막 단계의
미리보기 네 장(`Wizard.tsx` 의 `SCOPE_ART`)은 샘플 산출물을 직접 가리킨다. 두 가지가 조용히
이 그림을 깨뜨린다 — **prune-samples 가 그 파일을 지우거나, webp-samples 가 확장자를 바꾸거나.**
둘 다 실제로 겪었고 화면을 열기 전까지는 아무도 모른다. 검사 스크립트가 MISS 를 찍어 준다.
지금은 vermeilhoop 의 스케치·렌더·착용컷·정사영(`.webp`)을 가리킨다.

### 리포트 사진 · `/api/shot` 을 쓰지 말 것

PDF 에서 사진 주소를 고를 때는 반드시 `reportPhoto()`(research.ts)를 쓴다.
**구운 로컬 파일 → 원본 직링크** 순서로만 고르고 프록시는 절대 쓰지 않는다.
`/api/shot` 은 dev 서버에만 있어서, 정적 배포에서는 그 슬라이드가 전부 깨진 아이콘이 된다(실제로 그랬다).

**화면도 같은 규칙을 따라야 한다.** PDF 만 고쳐 놓고 화면(RunView·보드 카드)은 계속 `shotUrl()` 을
쓰고 있었다. 그래서 **배포된 데모의 경쟁 구도에 깨진 썸네일 3장이 남아 있었다** — 구운 사진이 없는
제품이 `product_url` 만 들고 프록시를 부르고 404 를 받았다. 지금은 `shotUrl()` 이 정적 빌드에서
프록시를 아예 만들지 않고 빈 문자열을 돌려준다(`BASE_URL !== '/'` 로 판별). **빈 문자열이 오면
`<img>` 를 그리지 말 것** — `src=""` 는 그 자체로 깨진 아이콘이다. 호출부는 전부 "사진 없음"으로 떨어진다.
Vite 가 BASE_URL 을 빌드 시점에 박아 넣으므로 Pages 번들에는 프록시 분기가 통째로 사라진다
(확인: `grep -c "api/shot" docs/assets/index-*.js` 가 0, `dist/` 는 1).

여백도 같은 뿌리였다. `img()` 가 URL 이 없을 때 빈 상자를 그려 사진 한 장 크기의 흰 자리를 붙잡고 있었다.
지금은 **사진이 없으면 아무것도 그리지 않고**, `tidyDeck()`(deck.ts)이 인쇄 직전에 한 번 훑어
못 뜬 이미지의 프레임과 속이 빈 칸을 걷어낸다. 내려받는 HTML 에는 같은 일을 하는 스크립트가 함께 들어간다.
**주의**: `printDeck` 이 이미지 로딩을 기다리며 `img.onerror` 를 덮어쓴다 — 인라인 onerror 에 기대지 말 것.

**함정 · `tidyDeck` 의 판정식을 건드리지 말 것.** 한때 `!im.complete || im.naturalWidth === 0` 으로
두었더니 **아직 받는 중인 사진까지 전부 지워서 리포트의 이미지가 통째로 사라졌다.**
반드시 `im.complete && im.naturalWidth === 0`(다 받고서 실패한 것만) 이어야 한다.
`deck.ts` 안에 같은 식이 두 군데 있다 — 함수 `tidyDeck()` 과 내려받기용 `TIDY_SCRIPT` 문자열.

### 비전 QA · 실제로 사진을 본다 (2026-08-12)

예전 `buildQA()` 는 **난수였다.** 스톤 개수를 세는 척하고, 존재하지 않는 유사도 `0.88` 을 찍고,
재시도는 `rng.chance(0.5)` 로 전부 `pass: true` 로 덮었다. 이미지를 다시 만들지도 않았다.

지금은 세 층이 분리돼 있다. **이 분리가 핵심이다.**
1. **결정적(우리 코드)** `src/core/visionQa.ts` — 어떤 검사를 할지, 목표가 무엇인지, 무엇이 통과인지.
2. **관측(모델)** `server/vision-qa-api.mjs` — "무엇이 보이는가"만 답한다. `unclear` 가 항상 선택지다.
3. **결과(파이프라인)** — 실패 하나당 컷 한 장을 고쳐 다시 만들고 **다시 검사한다**.

모델에게 통과 여부를 맡기면 검사가 아니라 두 번째 의견이 된다. 그래서 모델은 `observed_value` 를
고정 어휘로만 답하고 대조는 우리가 한다.

**주얼리 검사 항목**: 스톤 개수(0석 스펙에 유령 파베가 나오는 것이 첫 표적), 스톤 크기 등급,
세팅 방식, 프롱 수(단석·소수석만 — 파베 40석의 프롱을 세라고 하면 답이 지어진다), 금속 톤,
표면 마감, 체인 종류, 페어 여부, 컷 간 동일 객체.

**관용을 좁히지 말 것.** 개수는 6석까지 정확히, 그 위는 ±20%. 크기는 인접 등급까지 인정.
좁히면 에터니티·테니스가 전부 불일치로 잡혀 아무도 안 본다.

**함정**
- `status: 'unknown'` 은 통과가 아니다. 화면에서 초록으로 칠하면 안 본 것을 봤다고 말하는 셈이다.
- 검사에 넣을 컷은 **기준 뷰와 필수 추가 뷰뿐**이다. 컬러웨이는 일부러 색을 바꾼 것이고
  `variation`·`sketch_var` 은 일부러 다른 물건이다. 넣으면 전부 불일치가 된다.
- 교정 컷은 **자리에 끼워 넣어야** 한다. `view` 나 `origin` 이 바뀌면 여덟 군데가 기준 렌더를 잃는다.
- 캐시 태그는 `visqa2`. **프롬프트나 스키마를 바꾸면 반드시 올릴 것** — 안 올리면 옛 응답이
  그대로 나와서 고친 게 안 먹은 것처럼 보인다(실제로 겪었다).
- 모델이 `check_id` 에 줄 전체를 복사해 온 적이 있다. `gradeQa` 의 `find()` 가 부분 일치로 받아 준다.
- 정적 배포에는 `/api` 가 없어 전부 `unknown` 이 된다. 그게 정직한 결과지만, 데모는
  `npx tsx scripts/backfill-qa.mjs --go` 로 구운 결과를 들고 가야 한다.

검증: `node scripts/qa-probe.mjs <응답.json>` 이 채점 규칙을 확인한다. 실측으로 샘플 첫 디자인의
**스펙-이미지 불일치 2건(18K 골드 도금 스펙인데 화이트 메탈, 무광 스펙인데 유광)** 을 잡아냈다.
옛 가짜 QA 는 같은 디자인에 4/4 통과를 찍고 있었다.

### 근거 체인 · 지어낸 출처를 없앴다 (2026-08-12)

`buildRationale()` 이 모든 디자인에 `https://competitor.example/product/8812` 와
`supabase://uploads/archive_112.jpg` 를 근거로 달고 있었다. 날짜(`2026-05-14`)도 하드코딩이었다.
`buildModelEval()` 은 난수로 High/Medium 을 뽑고 그럴듯한 근거 문장을 붙였다.
샘플 신호의 출처 `https://observed.example/1037` 도, 무드보드 폴백의 `p.34` 쪽수도 지어낸 것이었다.

지금은 `EvidencePool` 에 **이 실행이 실제로 모은 것만** 담고, `referencesFor()` 가 모드별로 되짚는다.
트렌드는 레시피에 실린 조형 특징을 낸 제품으로, 시리즈는 판독된 DNA 로, 무드보드는 신호가 인용한 쪽으로.
**이어지지 않으면 비운다.** 빈 칸은 정직하지만 지어낸 출처는 정직하지 않다.
`buildModelEval` 은 연결 신호의 관측 수·레시피 원자 수·브랜드 룰 위반에서 실제로 계산한다.
잴 수 없으면 등급 대신 "Not measured" 라고 적는다.

**검증은 `node scripts/evidence-audit.mjs`** 가 한다. 배포 전에 반드시 0 이어야 한다.
도입 시점에 샘플에서 조작된 근거 36건을 잡아냈고, `scripts/fix-sample-evidence.mjs --go` 로 복구했다.
브라우저에 이미 저장된 옛 Run 은 `store.ts` 의 `scrubEvidence` 가 읽을 때 걷어낸다.

### 디자인 다양화 · 조건 레시피 (2026-08-11)

스케치마다 결과가 비슷하다는 지적의 원인: **모든 프롬프트에 같은 트렌드 절**(상위 신호 4개 +
첫 매크로의 소재·디테일·팔레트)이 실렸다. `src/core/recipes.ts` 가 조사 결과를 원자로 쪼개고
(신호 6 + 매크로 4 + 경쟁사 특징 5 = 최대 15), 디자인마다 **단독 → 2개 조합 → 융합(3개)** 을
순환 배정한다. 같은 조합은 두 번 쓰지 않는다. `d.recipe` 에 남아 카드·보드·리포트에 표시된다.
파이프라인의 `clauseFor(design_id)` 가 디자인별 절을 준다 — **공통 trendClause 를 직접 쓰는
코드를 새로 만들지 말 것.** 검증: 조건 7개 → 6개 전부 다른 조합, 절도 전부 다름.

### 베리에이션 · ai-vringon-create-variation 이식 (2026-08-11)

S3 제품 베리에이션이 사내 신발 베리에이션 워커(RebuilderAI/ai-vringon-create-variation)의
`build_instruction()` 방식을 그대로 쓴다: **양극 스타일 축 8개**(mood 창의↔클래식·맥시멀↔미니멀 /
silhouette 길이·볼륨 / density 밀도·청키 / edge 엣지·구조)를 -1~1 값으로 받아 |값|>0.2 인 축만
문구로 조립, "구조·팔레트 유지" 마무리 문장까지 동일. `aiClient.ts` 의 `variationInstruction()` +
프리셋 8종(`STYLE_PRESETS`). 슬라이더 UI 를 붙일 때는 `StyleVector` 를 그대로 노출하면 된다.

### 조사가 조용히 실패하는 자리 (2026-08-11)

**도시에의 매크로 4개는 각각 별도 호출이고 `Promise.allSettled` 로 모은다.**
예전에는 rejected 를 말없이 걸러서, 넷이 전부 실패해도 `macrotrends: []` 가 성공처럼
캐시됐다. 그 파라미터로는 영원히 빈 도시에가 나온다. 지금은 실패 이유를 로그에 남기고
한 번 재시도하며, 그래도 0개면 **캐시하지 않고 throw** 한다. 이 가드를 넣자마자 진짜
원인이 한 줄로 드러났다 — `OpenAI 429 credit_balance_exhausted`(계정 크레딧 소진).

교훈: **`allSettled` + `filter(fulfilled)` 는 전멸과 성공이 똑같이 생겼다.** 조사 계열에
이 패턴을 새로 쓸 때는 반드시 (1) 실패 이유 로그 (2) 빈 결과를 캐시하지 않기를 함께 둘 것.

### CSS 우선순위 함정 · React Flow 가 나중에 실린다 (2026-08-11)

리사이즈 손잡이를 6→14px 로 키운 적이 있는데 **화면에서는 계속 5px 이었다.** 우리 규칙과
React Flow 의 규칙이 `.react-flow__resize-control.handle` 로 선택자가 같고, 그쪽
스타일시트가 theme.css 보다 **나중에** 실려서 이긴다. 소스만 보면 고쳐진 것처럼 보인다.
지금은 `.board` 로 한 단계 좁혀 이긴다. 변(line) 핸들은 React Flow 가 `border-top-width`
같은 **낱개 속성을 같은 우선순위로** 다시 쓰므로, 묶음 `border-width` 만으로는 안 되고
변마다 하나씩 눌러야 한다. **확인은 반드시 `getComputedStyle` 로** — CSS 파일을 읽어서
판단하면 또 속는다.

### MD 페르소나 · 셀렉 피드백 (2026-08-11)

브랜드 설정 4번 섹션에서 MD 를 설정한다(`BrandIdentity.md`). LLM 페르소나가 잘 서는 요소는
가중치 숫자가 아니라 네 가지다: **시장·고객 맥락, 우선순위의 순서(순서=중요도), 즉시 탈락 룰,
사진에서 확인하는 체크포인트.** `server/md-api.mjs` 의 `/api/md/review` 가 페르소나 + 스펙 +
실제 렌더(input_image)를 주고 디자인마다 pick/hold/drop·이유·고칠 점을 받는다(mdrev1 캐시).
S4 에서 top 후보 전체를 리뷰해 `d.mdReview` 와 `st.mdPickRationale` 로 남긴다.
**지표(계층1)·모델평가(계층2)와 절대 합산하지 않는다.**

다만 **판정은 자리를 바꾼다.** 처음에는 리뷰가 선정 뒤에 돌아서 "MD 탈락"이라고 적힌
디자인이 Top 으로 발표되는 모순이 있었다. 지금은 drop 을 받은 Top 이 **같은 티어**의
미선정 후보 중 drop 이 아닌 것에게 자리를 넘긴다(pick > hold, 동률이면 캡 낮은 쪽).
티어 구성은 그대로 유지되고, 대체가 없으면 drop 판정을 단 채 남는다 — 조용히 지우면
반대 의견이 사라진다. 점수는 여전히 합산하지 않는다. 검증: 5개 시나리오(대체 있음/없음/
전멸/MD 미설정/pick·hold 동시)에서 티어 구성 100% 유지.

실측 품질: 우선순위(마진 캡 비율), 즉시탈락 룰(캡 90% 초과·마모 취약), 체크포인트(실루엣·
세팅 견고함)를 전부 실제로 인용했고, **시키지 않은 스펙-이미지 불일치**("무석 스펙인데
도면엔 4프롱 세팅이 보인다")까지 잡아냈다. 실패하면 조용히 지표만으로 진행한다.

### 리포트 장식 이미지 · 생성 아트

경쟁사 사진은 스크래핑으로 가져오고, **리포트를 꾸미는 그림은 따로 생성한다**(사용자 요청).
`reportArtPrompt()`(aiClient.ts)가 제품·사람·글자 없는 추상 정물을 요청하고,
pipeline 이 도시에가 나온 직후 표지 1장 + 매크로별 배너 3장을 `generateImage(..., 'fast', '1536x1024')`
로 만들어 `report-art` 이벤트로 올린다. **실패해도 리포트는 그대로 나간다**(try/catch, 로그만 남긴다).

원칙은 **내용 우선**이다. 아트는 `fill(list, i) = at(list, i) || at(artList, i)` 로 **빈 칸에만** 들어간다.
실측(vermeilhoop 샘플): 풀사이클은 아트를 넣어도 이미지 수 65장 그대로이고 아트는 표지·매크로 5칸만
차지한다. 반면 **조사만 돌린 런은 아트가 없으면 39장으로 줄고(빈 프레임 26개가 곧 여백) 아트를 넣으면
다시 65장**이 된다. 이 26칸이 사용자가 지적한 흰 여백의 정체였다.

KEY ITEMS 슬라이드는 `grid-template-columns` 를 아이템 수만큼만 연다. 세 칸 고정으로 두면
아이템이 하나일 때 나머지 2/3 가 통째로 흰 여백이 된다.

아트 주소는 `/api/image/file/<hash>.png` 라서 샘플 저장 핸들러가 **자동으로** `public/samples/` 로 굽는다
(RunState 전체를 정규식으로 훑는 구조라 별도 처리가 필요 없다).

### 보드 레이아웃 · 좌표는 계산해서 만든다

카드 높이는 76px부터 430px까지 벌어진다(사진 한 장이 220px). `row × 고정간격`으로 두면
반드시 겹친다 — 실제로 겹쳐 있었다. `measureCard()`가 글이 몇 줄로 접히는지까지 재고
(**한글은 폭이 2배라 글자 수가 아니라 폭으로 세야 한다**), 컬럼별로 그 높이를 쌓아 내린다.
`buildBoardModel`의 `row` 값은 **순서만** 정하고 좌표는 Board.tsx가 만든다. 카드를 추가할 때
row를 촘촘히 줘도 겹치지 않는다. 검증: 48~53장 보드에서 겹침 0, 카드 내용 넘침 0.

**종류 필터(전체·조사·디자인·선정)가 "안 먹는다"고 보이는 네 가지 이유** — 전부 필터 로직이 아니라
주변 문제였다. 1) 걸러내고 남은 칸이 **원래 있던 자리에 그대로** 서 있어서 화면 밖으로 밀린다
→ `repackColumns()` 가 남은 칸을 왼쪽으로 당겨 붙이고, 더해서 `fitView` 로 화면도 맞춘다.
**fitView 에만 기대면 안 된다** — 카메라가 어디였는지에 따라 결과가 갈리고, 숨은 창에서는
아예 돌지 않는다. 2) 걸러낸 카드로 가던 **선이 남아** 허공에 떠 보인다 → `visibleEdges`.
3) `appendix`(전제·한계 꼬리말)를 디자인 갈래에 끼워 뒀더니 **디자인이 없는 런에서도 카드가
한 장 남아** "비어 있다"고 알리지 못하고 텅 빈 보드처럼 보였다 → 어느 갈래에도 넣지 않는다.
4) **정말로 그 종류가 없는 런** → `.board-empty` 안내. 스크린샷 신고가 오면 **먼저 그 런에
해당 종류가 존재하는지부터 확인할 것**(`designs: 0 · endStage: S1` 인 샘플이었다).

실측(트렌드 66장 / 시리즈 41장): 네 필터 모두 화면에 카드가 남고 겹침 0, 시리즈의 디자인·선정은
"디자인을 그리기 전 단계에서 끝났습니다" 안내로 떨어진다.

**`colX` 는 표 끝을 넘어가면 늘려야 한다.** 예전에는 `Math.min(i, COL_X.length-1)` 로 **잘라 냈다**.
그래서 8번째 이후 칸이 전부 같은 x 에 겹쳐 서서 서로 다른 칸의 카드가 완전히 포개졌다
(3D 카드와 캠페인 카드가 352×333 으로 통째로 겹쳐 있었다). 지금은 `laneX()` 가 `COL_GAP_X` 만큼
이어 붙인다. 칸을 추가하는 기능이 있으므로 **칸 수는 COL_X 길이를 언제든 넘는다.**

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

**숨은 창에서는 긴 조사 요청이 죽는다.** 창이 화면에 없으면 크롬이 네트워크 I/O를 정지시켜
(`ERR_NETWORK_IO_SUSPENDED`) 몇 분씩 걸리는 조사 fetch 가 통째로 끊긴다. 서버 쪽 캐시에는
결과가 남지만 클라이언트는 못 받는다. **덱 산출물만 검증하려면 런을 돌리지 말고 모듈을 직접 불러라**:

    const st = await (await fetch('/src/samples/<샘플>.json')).json()
    const dp = await import('/src/core/dossierPdf.ts?t=' + Math.floor(performance.now()))
    dp.dossierDeckHtml({ ...st, reportArt: art }).html   // 프레임·이미지 수를 세면 된다

**캐시 버스터는 반드시 `?t=<정수>`** 로 줄 것. 앱이 이미 불러 둔 모듈은 브라우저 레지스트리에
남아서 **수정 전 코드가 그대로 돌아간다**(고친 게 반영 안 된 것처럼 보였다). 소수점을 쓰면
esbuild 가 확장자로 읽어 `Invalid loader value` 로 실패한다.

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
