import { NextResponse } from 'next/server';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
let storePromise: Promise<MemoryVectorStore> | undefined;

const sourceInfo: Record<string, { department: string; type: string }> = {
  '260827_조직 및 책임권한 규정_업무분장_더미파일.docx': { department: '전사 조직', type: '업무분장' },
  '설비자재구매그룹_구매관리규정_과제용.docx': { department: '설비자재구매그룹', type: '구매·자재' },
  '투자관리그룹_5억 이상 타당성 평가 및 심의 지침_과제용.docx': { department: '투자관리그룹', type: '투자·공사' },
  '회계세무그룹_회계관리규정_과제용.docx': { department: '회계세무그룹', type: '재무·회계' }
};

async function buildStore() {
  const dir = path.join(process.cwd(), 'source_docs');
  const names = await fs.readdir(dir);
  const loaded: Document[] = [];
  for (const name of names.filter((item) => item.endsWith('.docx'))) {
    const info = sourceInfo[name] ?? { department: '사내 규정', type: '업무 지침' };
    const docs = await new DocxLoader(path.join(dir, name)).load();
    loaded.push(...docs.map((doc) => new Document({
      pageContent: doc.pageContent,
      metadata: { ...doc.metadata, department: info.department, document: name, workType: info.type, source: `source_docs/${name}` }
    })));
  }
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 900, chunkOverlap: 120 });
  const chunks = await splitter.splitDocuments(loaded);
  return MemoryVectorStore.fromDocuments(chunks, new OpenAIEmbeddings({ model: 'text-embedding-3-small' }));
}

function getStore() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  storePromise ??= buildStore();
  return storePromise;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { question?: string; site?: string; category?: string };
    const question = body.question?.trim();
    if (!question) return NextResponse.json({ error: '업무 상황을 입력해 주세요.' }, { status: 400 });
    const store = await getStore();
    const retriever = store.asRetriever({ k: Number(process.env.RAG_TOP_K ?? 6) });
    const docs = await retriever.invoke([question, body.site, body.category].filter(Boolean).join(' / '));
    const context = docs.map((doc, index) => `[근거 ${index + 1}] ${doc.pageContent}\n출처: ${doc.metadata.document}\n부서: ${doc.metadata.department}\n업무 유형: ${doc.metadata.workType}`).join('\n\n');
    const model = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });
    const response = await model.invoke([
      ['system', '당신은 사내 업무분장 안내 도우미입니다. 제공된 근거만 사용하세요. 근거가 부족하면 부서를 추측하지 말고 반드시 "추가 확인이 필요합니다"라고 하세요. JSON 이외의 글은 출력하지 마세요.'],
      ['human', `질문: ${question}\n사업장: ${body.site ?? '미선택'}\n업무 유형: ${body.category ?? '자동 분류'}\n\n검색 근거:\n${context}\n\n다음 JSON 형식으로 답하세요: {"needsMoreInfo": boolean, "owner": string, "partners": string[], "reason": string, "evidence": [{"quote": string, "source": string}]}`]
    ]);
    const raw = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    const result = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '').trim());
    return NextResponse.json({ ...result, retrieved: docs.map((doc) => ({ content: doc.pageContent, ...doc.metadata })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RAG 검색 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
