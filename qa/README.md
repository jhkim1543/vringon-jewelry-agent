# QA 산출물

여기 있는 것은 제품이 아니라 **검증 기록**이다.

`samples/` 는 페르소나 QA 로 실제 돌린 실행 결과다. 각국 디자이너 페르소나를
GPT·Gemini 로 만들고, 그 사람들이 고른 설정 그대로 파이프라인을 돌린 뒤,
같은 사람들에게 자기 성공 기준으로 채점하게 한 것이다.

**`src/samples/` 에 두지 않는다.** `sampleRun.ts` 가
`await import(\`../samples/${id}.json\`)` 로 부르기 때문에, 그 폴더에 있으면
디렉터리 전체가 빌드에 청크로 실린다 — 아무도 부르지 않는 검증 기록 932KB 가
배포본에 따라간다. 실제로 그렇게 나가고 있었다.

읽는 도구
- `scripts/persona-qa.mjs` · `persona-gemini.mjs` — 페르소나를 만들고 실행한다
- `scripts/persona-eval.mjs` — 결과를 채점하고 토론시킨다 (생성 이미지를 함께 본다)
- 채점·토론 결과는 `.personaqa/` 로 나간다 (gitignore)

제품 데모로 쓰는 샘플은 `src/samples/sample_*.json` 여섯 개뿐이다.
