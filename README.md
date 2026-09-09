# 업무 지침 네비게이터

업무 상황을 사내 업무분장·지침 문서에서 검색하고, 검색된 근거를 바탕으로 주관 부서와 협업 부서를 추천하는 Next.js + LangChain 데모입니다. 기존 키워드 기반 추천 화면은 유지됩니다.

## 실행 방법

1. Node.js 18.18 이상을 설치합니다.
2. 프로젝트 폴더에서 `npm install`을 실행합니다.
3. `.env.example`을 복사해 `.env.local`을 만들고 `OPENAI_API_KEY=sk-...`를 입력합니다. 키는 소스 코드에 넣지 않습니다.
4. `npm run dev` 후 브라우저에서 `http://localhost:3000/reference`를 엽니다.

`RAG_TOP_K`는 검색할 chunk 수이며 기본값은 6입니다. 최초 질문 시 DOCX를 로드하고 chunking·embedding하므로 첫 응답이 조금 느릴 수 있습니다. 이 데모의 벡터 저장소는 서버 메모리에 생성됩니다.

## 동작 흐름

`source_docs/*.docx` → `DocxLoader` → `RecursiveCharacterTextSplitter` → OpenAI `text-embedding-3-small` → `MemoryVectorStore` → Retriever → `gpt-4o-mini`의 근거 기반 JSON 응답 순서입니다. 각 chunk에는 부서명, 문서명, 업무 유형, 출처 metadata가 붙습니다. 근거가 부족하면 모델 프롬프트가 추측을 막고 `추가 확인이 필요합니다`를 반환하도록 합니다.

기존 `rank()`는 화면의 비교 기준으로 보존되어 있습니다. 이는 질문 문자열에 키워드가 포함되는지, 사업장·업무 유형이 일치하는지, 일부 정규식 의도가 맞는지를 점수화하는 방식이며 의미 유사도와 문서 인용을 제공하지 못합니다. RAG API는 이 한계를 보완합니다.
