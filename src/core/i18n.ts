// ── 화면 언어 · 한국어 / English ────────────────────────────────────
// 키를 따로 만들지 않고 영문 원문을 그대로 키로 쓴다. 사전에 없으면 영문이 그대로 나가므로
// 번역이 빠져도 화면이 깨지지 않는다. 원문을 고치면 사전 항목도 같이 고쳐야 한다.
//
// 조사 결과(도시에·신호·경쟁사 제품명)는 모델이 영어로 만들어 낸 데이터라 번역하지 않는다.
// 화면 틀만 바꾸고, 데이터는 수집된 그대로 둔다.

import { useSyncExternalStore } from 'react'
import { JA } from './i18n.ja'

export type Lang = 'en' | 'ko' | 'ja'

export const LANGS: { id: Lang; short: string; label: string }[] = [
  { id: 'ko', short: 'KR', label: '한국어로 보기' },
  { id: 'ja', short: 'JP', label: '日本語で表示' },
  { id: 'en', short: 'EN', label: 'View in English' },
]

// 조사 결과를 쓸 때 모델에게 건네는 언어 이름. 화면 언어와 같은 값을 쓴다.
export const LANG_NAME: Record<Lang, string> = {
  en: 'English', ko: 'Korean (한국어)', ja: 'Japanese (日本語)',
}

const KEY = 'vringon.lang'

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'ko' || saved === 'en' || saved === 'ja') return saved
    const nav = navigator.language?.toLowerCase() ?? ''
    if (nav.startsWith('ko')) return 'ko'
    if (nav.startsWith('ja')) return 'ja'
    return 'en'
  } catch {
    return 'en'
  }
}

let lang: Lang = initial()
const listeners = new Set<() => void>()

export function getLang(): Lang { return lang }

export function setLang(l: Lang) {
  if (l === lang) return
  lang = l
  try { localStorage.setItem(KEY, l) } catch { /* 무시 */ }
  document.documentElement.lang = l
  listeners.forEach(fn => fn())
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    () => lang,
    () => lang,
  )
}

/** 영문 원문 → 현재 언어. 사전에 없으면 원문 그대로 나가므로 화면이 깨지지 않는다. */
export function t(s: string): string {
  if (lang === 'en') return s
  const dict = lang === 'ja' ? JA : KO
  return dict[s] ?? s
}

/** 치환이 있는 문장. t('{n} designs') 처럼 쓰고 vars로 값을 넣는다. */
export function tf(s: string, vars: Record<string, string | number>): string {
  let out = t(s)
  for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k]))
  return out
}

const KO: Record<string, string> = {
  // ── 공통 ────────────────────────────────────────────────────────
  // ── 위저드 · 질문 세 개로 나눈 화면 ──────────────────────────────
  'Designs per sketch': '스케치당 디자인 수',
  'designs in total, each from a trend-based prompt': '개 디자인 · 각각 트렌드 기반 프롬프트로 생성',
  'Per selected design. Half worn on a model, half staged.': '선정된 디자인마다. 절반은 착용, 절반은 연출.',
  'Only the final picks go to Tripo. The result is a GLB you can turn on the board.': '최종 후보만 Tripo로 갑니다. 보드에서 돌려 볼 수 있는 GLB가 나옵니다.',
  'From sketch to design': '스케치에서 디자인까지',
  'sketches': '개 스케치',
  'Based on': '근거',
  'Rendering': '렌더 중',
  'Prompt not stored for this older run': '옛 분석이라 프롬프트가 저장돼 있지 않습니다',
  'Open campaign shots and 3D': '캠페인 컷과 3D 열기',
  'None for this design': '이 디자인에는 없습니다',
  'Contents': '목차',
  'Report language': '리포트 언어',
  'Research, signals and both PDFs come out in this language.': '조사·신호·PDF 두 종이 이 언어로 나옵니다.',
  'Select': '선택',
  'Lane': '칸',
  'Cancel': '취소',
  'Click the board to place a note': '보드를 누르면 그 자리에 메모가 놓입니다',
  'Click the board to add a lane': '보드를 누르면 칸이 추가됩니다',
  'Delete this note': '이 메모 삭제',
  'Hide this card': '이 카드 숨기기',
  'Edit text': '글 편집',
  'cards': '개 카드',
  'approved': '승인',
  'rejected': '불채택',
  'Double-click any card to rewrite it': '카드를 두 번 누르면 고칠 수 있습니다',
  'Forecast evidence': '예측 근거 상세',
  'Collected products': '수집된 제품 원본',
  'Report text': '리포트 원문',
  'Products found': '수집된 제품',
  'Design traits observed': '관측된 디자인 특징',
  'Market signals': '시장 신호',
  'in band': '범위 내',
  'strong': '근거 강함',
  'Next season forecast': '다음 시즌 예측',
  'Forecast for': '예측 대상',
  'Evidence from': '근거 시즌',
  'What it does next season': '다음 시즌 전개',
  'Confidence': '확신도',
  'high': '높음',
  'medium': '보통',
  'low': '낮음',
  'Season report': '다음 시즌 예측',
  'Share': '공유',
  'Copy a link to this board': '이 보드 링크 복사',
  'Link copied. It opens this board in a browser that has this run.': '링크를 복사했습니다. 이 분석을 가진 브라우저에서 열립니다.',
  'Could not copy the link': '링크를 복사하지 못했습니다',
  'That shared board is not in this browser.': '공유된 보드가 이 브라우저에 없습니다.',
  'Boards are stored locally, so a link only opens one this browser already has. Ask for the exported file, or open the link on the machine that ran it.': '보드는 브라우저에 저장됩니다. 링크만으로는 이미 가진 보드만 열립니다. 내보낸 파일을 받거나, 분석을 돌린 기기에서 링크를 여세요.',
  'macro trends': '매크로 트렌드',
  'trend report': '트렌드 리포트',
  'The analysis is still filling in. Sections appear as they land.': '분석이 채워지는 중입니다. 완성되는 대로 항목이 나타납니다.',
  'Key macro trends': '주요 매크로 트렌드',
  'Data sources': '데이터 출처',
  'Design implications': '디자인 시사점',
  'Top trending designs': '상위 디자인',
  'View all designs': '전체 디자인 보기',
  'Competitive landscape': '경쟁 구도',
  'Traits observed': '관측된 특징',
  'Key products': '대표 제품',
  'Price range': '가격대',
  'In band': '범위 내',
  'none recorded': '기록 없음',
  'Silhouette': '실루엣',
  'Material': '소재',
  'Detail': '디테일',
  'Palette': '팔레트',
  'Market direction': '시장 방향',
  'Collected up to': '수집 기준',
  'web searches': '회 웹 검색',
  'sources': '개 출처',
  'Download PDF': 'PDF 내려받기',
  '1 · Input': '1 · 입력',
  '2 · Research': '2 · 조사',
  '3 · Signals': '3 · 신호',
  '4 · Directions': '4 · 디렉션',
  '5 · Designs': '5 · 디자인',
  '6 · Selection': '6 · 선정',
  '7 · Variations': '7 · 베리에이션',
  '8 · Campaign shots': '8 · 캠페인 컷',
  '9 · 3D showroom': '9 · 3D 쇼룸',
  'What you gave it': '입력한 것',
  'What the agent collected': '에이전트가 수집한 것',
  'Trend research': '트렌드 조사',
  'Your uploads, read': '올린 파일을 읽은 결과',
  'Observations with a source': '출처가 있는 관측',
  'Signals combined': '신호를 엮은 방향',
  'Spec, rules, image': '스펙, 룰, 이미지',
  'Metrics and calls': '지표와 판정',
  'One sketch, several products': '스케치 하나에서 여러 제품',
  'Worn on a model, staged on set': '모델 착용과 연출컷',
  'Turn it, or open it full size': '돌려 보거나 크게 열기',
  'Back to the start': '처음 화면으로',
  'Campaign cuts': '캠페인 컷',
  'Campaign shots': '캠페인 컷',
  'Half worn on a model, half staged in studio and on location': '절반은 모델 착용, 절반은 스튜디오·로케이션 연출',
  '3D showroom': '3D 쇼룸',
  'With a 3D showroom': '3D 쇼룸까지',
  'Top picks scored, then worn on a virtual model and staged in studio and on location.': '최종 후보를 뽑아 가상 모델에 착용시키고, 스튜디오와 로케이션으로 연출합니다.',
  'Multiview renders go to Tripo. You get a 3D model you can turn on the board.': '멀티뷰 렌더를 Tripo에 넘겨 보드에서 돌려 볼 수 있는 3D 모델을 만듭니다.',
  'Open full size': '크게 보기',
  'Download GLB': 'GLB 내려받기',
  'Open 3D': '3D 열기',
  'Loading the model': '모델을 불러오는 중',
  'Could not load the model': '모델을 열지 못했습니다',
  'Drag to turn · scroll to zoom': '드래그로 회전 · 스크롤로 확대',
  'Campaign': '캠페인',
  'Virtual fitting': '가상 착용',
  'New run': '새 분석',
  'Current session': '이번 세션',
  'Clear session': '세션 초기화',
  'Searches': '웹 검색',
  'This is a preview of the full demo.': '전체 데모의 미리보기입니다.',
  'Learn how it actually works': '실제로 어떻게 도는지 보기',
  'What to create': '무엇을',
  'Results': '결과물',
  'Reference': '출발점',
  'Category': '품목',
  'Research competitors and market trends': '경쟁사와 시장 트렌드를 조사합니다',
  'Carry on a series you already have': '이미 있는 시리즈를 이어 갑니다',
  'Pick where the design should start from. It decides what gets researched in the next step.':
    '디자인이 무엇에서 출발할지 고릅니다. 다음 단계에서 무엇을 조사할지가 여기서 정해집니다.',
  'Footwear family': '신발 계열',
  'Jewelry family': '주얼리 계열',
  'N lasts in the library. Athletic types need a running last.':
    '라스트 N종 보유 · 운동화 계열은 러닝 라스트가 필요합니다.',
  'N molds in the library. Core designs must reuse an existing mold.':
    '몰드 N종 보유 · Core는 기존 몰드를 다시 써야 합니다.',
  'Project summary': '분석 요약',
  'Estimated time': '예상 소요',
  'Estimated cost': '예상 비용',
  'View details': '자세히 보기',
  'Hide details': '접기',
  'Recent': '최근',
  'Steps': '단계',
  'What': '무엇을',
  'Output': '결과물',
  'What are we making?': '무엇을 만들까요?',
  'What should the research look at?': '무엇을 조사할까요?',
  'How far should we take it?': '어디까지 만들까요?',
  'Starting point': '출발점',
  'Research competitors and trends': '경쟁사와 트렌드를 조사합니다',
  'Extend a series you already have': '이미 있는 시리즈를 이어 갑니다',
  'Work only from a file you upload': '올린 파일만 가지고 작업합니다',
  'families': '계열',
  'lasts loaded. Athletic types need a running last.': '개 라스트 보유. 운동화 계열은 러닝 라스트가 필요합니다.',
  '22 molds loaded. Core designs must reuse an existing mold.':
    '몰드 22종 보유. Core는 기존 몰드를 다시 써야 합니다.',
  'Competitor brands': '경쟁 브랜드',
  'Their best sellers and the trends around them get searched on the web.':
    '이 브랜드들의 베스트셀러와 주변 트렌드를 웹에서 조사합니다.',
  'Where it sits in the market': '시장에서의 위치',
  'Your series': '내 시리즈',
  'What it stands for': '시리즈가 지켜 온 것',
  'What this series has kept, and what you want to change this season':
    '이 시리즈가 지켜 온 것과, 이번 시즌에 바꾸고 싶은 것',
  'The only outside research in this mode': '이 모드에서 유일한 외부 조사입니다',
  'Your file': '내 파일',
  'Upload past designs from this series': '이 시리즈의 지난 디자인을 올려 주세요',
  '8 or more, so the constants can be told apart': '8장 이상이어야 무엇이 변하지 않았는지 가려낼 수 있습니다',
  'Upload your trend report or moodboard PDF': '트렌드 리포트나 무드보드 PDF를 올려 주세요',
  'Nothing outside these files is used': '이 파일 밖의 자료는 쓰지 않습니다',
  'Anything specific to look for': '특별히 봐야 할 것이 있다면',
  'Uploaded files are treated as data, never as instructions':
    '올린 파일은 자료로만 읽습니다. 지시문으로 따르지 않습니다.',
  'Stop after': '어디까지',
  'Through sketches': '스케치까지',
  'Finished designs': '디자인 완성',
  'With worn shots': '착용컷까지',
  'With campaign shots': '캠페인컷까지',
  'How many': '수량',
  'Show me the sketches before rendering': '렌더 전에 스케치를 먼저 보여주세요',
  'Advanced settings': '세부 설정',
  'Hide advanced settings': '세부 설정 접기',
  'Image cap': '이미지 상한',
  'move on': '장이 다음 단계로',
  'reusable': '장 재사용 가능',
  'Back': '이전',
  'Start the run': '분석 시작',
  'Show the breakdown': '단계별로 보기',
  'Hide the breakdown': '접기',
  'Saved runs': '지난 분석',
  'Name': '이름',

  'Create': '새로 만들기',
  'Run': '분석',
  'Board': '보드',
  'Run setup': '분석 설정',
  'Run Setup': '분석 설정',
  'History': '분석 내역',
  'Starred': '즐겨찾기',
  'Library': '라이브러리',
  'Set up brand': '브랜드 설정',
  'Reset': '되돌리기',
  'Close': '닫기',
  'Add': '추가',
  'Remove': '삭제',
  'Delete': '삭제',
  'Continue': '계속',
  'Reload': '새로고침',
  'Back to setup': '설정으로 돌아가기',
  'Star': '즐겨찾기',
  'Remove star': '즐겨찾기 해제',
  'Sample': '샘플',
  'All': '전체',
  'On': '켬',
  'Off': '끔',
  'Model': '모델',
  'Images': '이미지',
  'Cost': '비용',
  'Time': '소요',
  'Scope': '분석 범위',
  'Product': '품목',
  'Family': '계열',
  'Type': '세부 품목',
  'Price': '가격',
  'Tier': '가격대',
  'Brands': '브랜드',
  'Quick add': '빠른 추가',
  'Competitors': '경쟁사',
  'Trends': '트렌드',
  'Your files': '업로드 자료',
  'Files': '파일',
  'Series': '시리즈',
  'Research': '조사',
  'Sketches': '스케치',
  'Designs': '디자인',
  'Selection': '선정',
  'Variations': '베리에이션',
  'Signals': '신호',
  'Directions': '디렉션',
  'Input': '입력',

  // ── 실행 설정 ───────────────────────────────────────────────────
  'Design Agent': '디자인 에이전트',
  'Set the brief, pick how far to go, and run.': '브리프를 정하고, 어디까지 갈지 고른 뒤 분석을 시작합니다.',
  'Agent mode': '에이전트 모드',
  'Trend': '트렌드',
  'Moodboard': '무드보드',
  'Selected': '선택됨',
  'Name your competitors. Their best sellers and the trends get researched.':
    '경쟁사를 적으면 그 브랜드의 잘 팔리는 제품과 트렌드를 조사합니다.',
  'Upload your series and what it stands for. Trends are added on top.':
    '시리즈 디자인과 그 가치를 올리면, 트렌드를 그 위에 얹습니다.',
  'Works only from the report or moodboard you upload.':
    '올린 리포트·무드보드만 가지고 작업합니다.',
  'Researches competitor products and market trends': '경쟁사 제품과 시장 트렌드를 조사합니다',
  'Reads your series, then checks trends only': '시리즈를 읽고, 트렌드만 함께 조사합니다',
  'Uses only the files you upload': '올린 파일만 사용합니다',
  'Real brand names only. They get searched on the web.': '실제 브랜드명만 넣으세요. 웹에서 검색합니다.',
  'Brand name': '브랜드명',
  'KRW. Search widens 30% beyond this.': '원. 검색은 이 범위에서 30% 더 넓게 봅니다.',
  'Add at least one competitor': '경쟁사를 한 곳 이상 넣어주세요',
  'Upload your series designs': '시리즈 디자인을 올려주세요',
  'Describe what the series stands for': '시리즈가 무엇을 지향하는지 적어주세요',
  'Upload a PDF': 'PDF를 올려주세요',
  'Volume': '분량',
  'Generation': '생성',
  'Sketch count': '스케치 수',
  'Top picks': '최종 후보',
  'At least one from each tier': '유형마다 최소 한 건',
  'Mix': '유형 비율',
  'Core : Push : Signature': 'Core : Push : Signature',
  'To render': '렌더 진출',
  'Views': '뷰 수',
  'Colorways': '컬러웨이',
  'Worn': '착용컷',
  'Concept shoot': '컨셉 촬영',
  'Video': '영상',
  'Branches off one sketch, one axis changed each': '스케치 하나에서 갈라집니다. 한 번에 한 축만 바꿉니다',
  'Worn on a virtual model, on set, on location': '가상 모델 착용, 스튜디오, 로케이션',
  'Video costs the most. Reviews run on stills.': '영상이 가장 비쌉니다. 품평은 스틸로 합니다.',
  'More settings': '세부 설정',
  'Hide settings': '세부 설정 접기',
  'Pause after sketches for review': '스케치 후 검토를 위해 멈춤',
  'Anything past the cap falls back to a diagram': '상한을 넘으면 도식으로 대체합니다',
  'Rule-failed specs are never rendered. Extra views are edits of the base render.':
    '룰에 걸린 스펙은 렌더하지 않습니다. 추가 뷰는 기준 렌더의 편집입니다.',
  'Spec diagrams only': '도식만 생성',
  'No image server. Diagrams only.': '이미지 서버가 없어 도식만 나옵니다.',
  'None': '없음',

  // 실행 범위
  'Research only': '조사만',
  'Worn shots': '착용컷',
  'Competitors, trend signals and the season dossier. No images.':
    '경쟁사, 트렌드 신호, 다음 시즌 예측. 이미지는 없습니다.',
  'Everything above, plus specs, rule checks and hand-drawn sketches.':
    '위 전부에 더해 스펙, 룰 검사, 손그림 스케치까지.',
  'Sketches turned into finished renders, extra views and product variations.':
    '스케치를 완성 렌더로, 추가 뷰와 제품 베리에이션까지.',
  'Top picks scored, then photographed on a model.': '최종 후보를 뽑아 모델에 착용시켜 촬영합니다.',
  'Worn on a virtual model, staged in studio and on location, plus clips, board and talk track.':
    '가상 모델 착용, 스튜디오·로케이션 연출, 클립과 보드, 발표 노트까지.',

  // ── 정적 배포 안내 ──────────────────────────────────────────────
  'Read-only demo.': '보기 전용 데모입니다.',
  'How to run it for real': '실제로 돌리는 방법',
  'Live runs need the local server. Open the saved sample from History to see a finished run.':
    '분석은 로컬 서버가 있어야 합니다. 분석 내역에서 저장된 샘플을 열면 완료된 결과를 볼 수 있습니다.',

  // ── 라이브러리 ──────────────────────────────────────────────────
  'Past runs, with their boards. Star the ones worth keeping.':
    '지난 분석과 그 보드입니다. 남겨둘 것은 즐겨찾기해 두세요.',
  'Run the agent once and it will show up here.': '에이전트를 한 번 돌리면 여기에 쌓입니다.',
  'Finished runs are kept here. Nothing yet.': '완료된 분석이 여기 남습니다. 아직 없습니다.',
  'passed': '통과',

  // ── 실행 화면 ───────────────────────────────────────────────────
  'Signals and directions': '신호와 디렉션',
  'Specs, rules, rationale': '스펙, 룰, 근거',
  'Renders and views': '렌더와 뷰',
  'Metrics and top picks': '지표와 최종 후보',
  'Board and notes': '보드와 노트',
  'Starting the pipeline': '파이프라인을 시작합니다',
  'Partial results appear here as they land': '결과가 나오는 대로 여기 붙습니다',
  'Progress log': '진행 로그',
  'Log': '로그',
  'Open board': '보드 열기',
  'Season dossier': '다음 시즌 예측',
  'Trend report': '트렌드 리포트',
  'Dossier PDF': '예측 리포트 PDF',
  'Report PDF': '리포트 PDF',
  'Building': '작성 중',
  'Writing': '작성 중',
  'How the last few seasons moved': '최근 시즌의 흐름',
  'What to change in the design': '디자인으로 옮길 지점',
  'Still unverified': '아직 확인하지 못한 것',
  'From': '근거',
  'source': '출처',
  'Review gate': '중간 검토',
  'Approve or reject on the cards. Reasons feed the next run.':
    '카드에서 승인·탈락을 정합니다. 사유는 다음 분석에 반영됩니다.',
  'Mapping the macrotrends first, then filling each one with palettes, materials, details and key items.':
    '매크로트렌드를 먼저 잡고, 각각에 팔레트·소재·디테일·키아이템을 채웁니다.',
  'Breaking it into sub-questions and pulling them together. It lands here when done.':
    '하위 질문으로 나눠 조사한 뒤 종합합니다. 끝나면 여기 붙습니다.',

  // ── 카드 ────────────────────────────────────────────────────────
  'Target': '목표',
  'Passed rules': '룰 통과',
  'Rule reject': '룰 탈락',
  'Diagram': '도식',
  'View mismatch': '뷰 불일치',
  'Approve': '승인',
  'Reject': '탈락',
  'Approved': '승인됨',
  'Rejected': '탈락',
  'Confirm reasons': '사유 확정',
  'Reasoning, metrics, cost': '근거 · 지표 · 원가',
  'Metrics, calculated and reproducible': '지표 · 계산으로 재현 가능',
  'Model judgement, kept separate': '모델 평가 · 합산하지 않음',
  'Signals behind this, with sources': '구동 신호와 출처',
  'References, for attribution': '레퍼런스 · 출처 표기용',
  'Concept prompt': '컨셉 프롬프트',
  'Inherited series DNA': '시리즈 DNA 계승',
  'Why this tier': '유형 배치 사유',
  'Talk track': '발표 노트',
  'Vision QA': '비전 QA',
  'Cost, with band, assumptions and exclusions': '원가 · 밴드 · 가정 · 제외 항목',
  'Distance between top picks': '후보 간 차이',
  'A concept rendering of the target spec. It may not match the numbers exactly.':
    '목표 스펙의 컨셉 표현입니다. 수치와 다를 수 있습니다.',
  'blocked from generation, attributes only': '생성 투입 차단 · 속성 추출만',

  // ── 보드 ────────────────────────────────────────────────────────
  'Review board': '품평 보드',
  'Input → Research → Signals → Directions → Designs → Picks':
    '입력 → 조사 → 신호 → 디렉션 → 디자인 → 선정',
  'Present': '발표 모드',
  'Zoom in': '확대',
  'Zoom out': '축소',
  'Fit': '전체 보기',
  'Links': '연결선',
  'Edit': '편집',
  'Add note': '메모 추가',
  'Add lane': '칸 추가',
  'Reset edits': '편집 초기화',
  'Hide': '숨기기',
  'Export to Miro': 'Miro로 내보내기',
  'Exporting': '내보내는 중',
  'Board PDF': '보드 PDF',
  'Prev': '이전',
  'Next': '다음',
  'Exit': '나가기',
  'Notes': '노트',
  'Nothing on the board yet.': '보드가 비어 있습니다.',
  'Run the agent and the flow from research to selection fills in.':
    '에이전트를 돌리면 조사부터 선정까지의 흐름이 채워집니다.',
  'No run open. Start one from Run setup.': '열린 분석이 없습니다. 분석 설정에서 시작하세요.',
  'Double-click to edit': '더블클릭해서 고치기',
  'Double-click to write': '더블클릭해서 쓰기',
  'Show the lines between nodes': '노드 사이 연결선 표시',
  'Drop a note card on the board': '보드에 메모 카드를 놓습니다',
  'Open another lane on the right': '오른쪽에 칸을 하나 더 엽니다',
  'Back to the generated board': '생성된 보드로 되돌립니다',
  'Discard every edit you made on this board?': '이 보드에서 고친 내용을 모두 버릴까요?',
  'Note': '메모',
  'New lane': '새 칸',
  'Yours to fill': '직접 채우는 칸',

  // ── 브랜드 게이트 ───────────────────────────────────────────────
  'Set up your brand first': '브랜드 설정을 먼저 해주세요',
  'Run without it': '설정 없이 진행',

  // ── 오류 ────────────────────────────────────────────────────────
  'Something broke while rendering': '화면을 그리다가 문제가 생겼습니다',
  'Export failed': '내보내기 실패',

  // ── 품목·유형·엔진 라벨 ─────────────────────────────────────────
  'Footwear': '신발',
  'Jewelry': '주얼리',
  'Sneakers': '스니커즈',
  'Dress': '구두',
  'Heels': '힐',
  'Flats': '플랫',
  'Boots': '부츠',
  'Sandals': '샌들',
  'Rings': '반지',
  'Earrings': '귀걸이',
  'Necklaces': '목걸이',
  'Bracelets': '팔찌',
  'Other': '기타',
  'Running, court': '러닝 · 코트',
  'Loafer, oxford': '로퍼 · 옥스퍼드',
  'Pump, slingback': '펌프스 · 슬링백',
  'Ballet, driving': '발레 · 드라이빙',
  'Ankle, chelsea': '앵클 · 첼시',
  'Strap, slide': '스트랩 · 슬라이드',
  'Band, solitaire': '밴드 · 솔리테어',
  'Stud, hoop': '스터드 · 후프',
  'Pendant, chain': '펜던트 · 체인',
  'Bangle, cuff': '뱅글 · 커프',
  'Brooch, anklet': '브로치 · 앵클릿',
  'Running': '러닝화',
  'Court': '코트',
  'Chunky': '청키',
  'Trail': '트레일',
  'Loafer': '로퍼',
  'Derby': '더비',
  'Oxford': '옥스퍼드',
  'Monk strap': '몽크스트랩',
  'Pump': '펌프스',
  'Slingback': '슬링백',
  'Mary jane': '메리제인',
  'Mule': '뮬',
  'Ballet flat': '발레 플랫',
  'Driving': '드라이빙',
  'Ankle boot': '앵클부츠',
  'Chelsea': '첼시부츠',
  'Knee-high': '롱부츠',
  'Combat': '워커',
  'Strappy': '스트랩 샌들',
  'Slide': '슬라이드',
  'Gladiator': '글래디에이터',
  'Band': '밴드링',
  'Solitaire': '솔리테어',
  'Eternity': '이터니티',
  'Signet': '시그넷',
  'Stud': '스터드',
  'Hoop': '후프',
  'Drop': '드롭',
  'Ear cuff': '이어커프',
  'Pendant': '펜던트',
  'Choker': '초커',
  'Chain': '체인',
  'Station': '스테이션',
  'Bangle': '뱅글',
  'Cuff': '커프',
  'Tennis': '테니스',
  'Brooch': '브로치',
  'Anklet': '앵클릿',
  'Core': 'Core',
  'Push': 'Push',
  'Signature': 'Signature',
  'Sketch': '스케치',
  'Design': '디자인',
  'Fast': '빠른 모델',
  'Detailed': '디테일 모델',
  'For volume. Top quality, shorter wait.': '장수가 많을 때. 품질은 그대로, 대기가 짧습니다.',
  'For the board. The most detail this can do.': '품평에 올릴 안. 낼 수 있는 최대 디테일입니다.',
  'Research and image generation run on a local Node server that is not part of this static build, so nothing is called from here. Everything a full run produced is saved: open History in the left rail to walk through the sample run, its board, the season dossier and the PDFs.': '조사와 이미지 생성은 로컬 Node 서버에서 도는데, 이 정적 빌드에는 그 서버가 없어 아무것도 호출하지 않습니다. 대신 한 번의 분석이 만든 결과가 전부 저장돼 있습니다. 왼쪽 분석 내역을 열면 샘플 분석과 보드, 다음 시즌 예측, PDF까지 볼 수 있습니다.',
  'This session': '이번 세션',
  'images': '장',
  'searches': '회 검색',
  'mass': '매스',
  'contemporary': '컨템포러리',
  'premium': '프리미엄',
  'luxury': '럭셔리',
  'Save as file': '파일로 저장',
}
