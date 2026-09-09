'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Department = { id: string; name: string; parent: string; sites: string[]; categories: string[]; keywords: string[]; responsibility: string; sourcePath: string };
type Match = Department & { score: number; reasons: string[] };
type Workflow = { id: string; title: string; keywords: string[]; threshold: string; steps: { order: number; title: string; owner: string; detail: string; evidence: string }[]; note: string };
type RagResult = { needsMoreInfo: boolean; owner: string; partners: string[]; reason: string; evidence: { quote: string; source: string }[]; retrieved: { content: string; document?: string; department?: string; workType?: string }[] };

const sites = ['미선택', '포항', '광양', '세종', '전사'];
const categories = ['자동 분류', '안전', '환경', '설비·정비', '구매·자재', '투자·공사', '생산·조업', '품질', '재무·회계', '컴플라이언스'];
const examples = [
  ['포항 설비 교체', '포항 공장의 설비를 교체하려는데 먼저 협의할 부서를 알고 싶어요.', '포항'],
  ['신규 원료 구매', '신규 원료 구매 전에 품질과 환경 측면에서 확인할 부서를 찾아주세요.', '미선택'],
  ['투자·공사 사전 협의', '공장 증설 공사를 준비하는데 투자와 안전 측면에서 협의가 필요합니다.', '광양'],
] as const;

function rank(question: string, site: string, category: string, departments: Department[], workflows: Workflow[]): Match[] {
  const text = question.toLowerCase();
  const workflow = workflows.find((item) => item.keywords.filter((keyword) => text.includes(keyword.toLowerCase())).length >= 2);
  const workflowOrder = new Map<string, number>();
  workflow?.steps.forEach((step) => {
    if (!workflowOrder.has(step.owner)) workflowOrder.set(step.owner, step.order);
  });
  return departments.map((department) => {
    let score = 0; const reasons: string[] = [];
    const matchedCategories = department.categories.filter((item) => text.includes(item.toLowerCase()));
    const matchedKeywords = department.keywords.filter((item) => text.includes(item.toLowerCase()));
    if (category !== '자동 분류' && department.categories.includes(category)) { score += 6; reasons.push(`${category} 업무유형 일치`); }
    else if (matchedCategories.length) { score += 6; reasons.push(`${matchedCategories[0]} 업무유형 일치`); }
    if (site !== '미선택' && (department.sites.includes(site) || department.sites.includes('전사'))) { score += department.sites.includes(site) ? 5 : 2; reasons.push(department.sites.includes(site) ? `${site} 사업장 담당` : '전사 담당 조직'); }
    if (matchedKeywords.length) { score += Math.min(matchedKeywords.length * 2, 6); reasons.push(`${matchedKeywords.slice(0, 3).join('·')} 키워드 일치`); }
    if (department.id === 'investment' && /(투자|승인|5억|5억원|타당성|심의|투자비)/.test(text)) { score += 10; reasons.push('투자 승인·심의 의도 일치'); }
    if (department.id === 'accounting-tax' && /(회계|회계처리|비용|자산|감가상각|전표)/.test(text)) { score += 7; reasons.push('회계처리 의도 일치'); }
    if (department.id === 'equipment-material' && /(구매|설비|발주|계약)/.test(text)) { score += 4; reasons.push('설비 구매·계약 의도 일치'); }
    return { ...department, score, reasons };
  }).filter((item) => item.score > 0).sort((a, b) => {
    const aOrder = workflowOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = workflowOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.score - a.score || a.name.localeCompare(b.name, 'ko');
  });
}

function level(score: number): [string, string] { return score >= 11 ? ['높음', 'high'] : score >= 6 ? ['보통', 'medium'] : ['추가 확인 필요', 'low']; }

export default function Home() {
  const [departments, setDepartments] = useState<Department[]>([]); const [workflows, setWorkflows] = useState<Workflow[]>([]); const [question, setQuestion] = useState(''); const [site, setSite] = useState('미선택'); const [category, setCategory] = useState('자동 분류'); const [searched, setSearched] = useState(false); const [error, setError] = useState(''); const [draft, setDraft] = useState(''); const [copied, setCopied] = useState(false); const [pendingDepartment, setPendingDepartment] = useState<Match | null>(null); const [requestClosed, setRequestClosed] = useState(false); const [requestStatus, setRequestStatus] = useState<'작성중' | '검토 대기' | '검토중' | '회신 완료'>('작성중'); const [rag, setRag] = useState<RagResult | null>(null); const [ragLoading, setRagLoading] = useState(false);
  useEffect(() => { Promise.all([fetch('/pilot_departments.json').then((r) => r.json()), fetch('/instruction_workflows.json').then((r) => r.json())]).then(([departmentData, workflowData]) => { setDepartments(departmentData.organizations); setWorkflows(workflowData.workflows); }).catch(() => setError('데모 데이터를 불러오지 못했습니다.')); }, []);
  const results = useMemo(() => rank(question, site, category, departments, workflows), [question, site, category, departments, workflows]); const primary = results[0];
  const workflow = useMemo(() => workflows.find((item) => item.keywords.filter((keyword) => question.toLowerCase().includes(keyword.toLowerCase())).length >= 2), [question, workflows]);
  async function searchRag() { setRagLoading(true); setRag(null); try { const response = await fetch('/api/rag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, site, category }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRag(data); } catch (ragError) { setError(ragError instanceof Error ? ragError.message : 'RAG 검색에 실패했습니다.'); } finally { setRagLoading(false); } }
  function submit(event: FormEvent) { event.preventDefault(); setDraft(''); if (!question.trim()) { setError('업무 상황을 입력해 주세요.'); return; } setError(''); setSearched(true); void searchRag(); }
  function selectExample(example: typeof examples[number]) { setQuestion(example[1]); setSite(example[2]); setCategory('자동 분류'); setError(''); setDraft(''); setSearched(true); setRagLoading(true); setRag(null); void fetch('/api/rag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: example[1], site: example[2], category: '자동 분류' }) }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setRag(data); }).catch((ragError) => setError(ragError instanceof Error ? ragError.message : 'RAG 검색에 실패했습니다.')).finally(() => setRagLoading(false)); }
  function createDraft(department: Match) { setPendingDepartment(department); setRequestClosed(false); setDraft(''); setCopied(false); setRequestStatus('작성중'); }
  function confirmDraft() { if (!pendingDepartment) return; const department = pendingDepartment; setDraft(`수신: ${department.name}\n제목: [사전 협의 요청] ${department.name} 관련 업무 검토\n\n업무 상황\n${question}\n\n사업장: ${site === '미선택' ? '미입력' : site}\n요청 사항\n1. 관련 절차와 사전 검토 필요 여부를 확인해 주세요.\n2. 추가로 협의해야 할 부서나 담당 업무가 있으면 안내해 주세요.\n3. 검토 결과와 다음 진행 단계를 회신해 주세요.\n\n추천 근거\n${department.reasons.join(', ')}\n업무분장 근거\n${department.sourcePath}`); setPendingDepartment(null); setRequestStatus('작성중'); }
  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">R</span><span>업무 지침 네비게이터</span></div><nav className="nav-links" aria-label="주 메뉴"><a className="active" href="#dashboard">Dashboard</a><a href="#results">Regulatory Search</a><a href="#notice">Compliance Hub</a></nav><span className="demo-badge">업무분장 더미파일 기반 데모</span></header>
    {!searched && <section className="hero"><p className="eyebrow">지침 기반 부서 안내</p><h1>무엇을 도와드릴까요?</h1><p className="lead">업무 상황을 입력하면 관련 지침에 따라 협의할 부서 후보와 근거를 안내합니다.</p>
      <form onSubmit={submit} className="search-panel"><label htmlFor="question">업무 상황</label><textarea id="question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="예: 포항 공장의 설비를 교체하려는데 먼저 협의할 부서를 알고 싶어요." /><div className="search-options"><label>사업장<select value={site} onChange={(e) => setSite(e.target.value)}>{sites.map((item) => <option key={item}>{item}</option>)}</select></label><label>업무 유형<select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><button>부서 찾기</button></div></form>
      <div className="examples">{examples.map((example) => <button type="button" key={example[0]} onClick={() => selectExample(example)}>{example[0]}</button>)}</div>
    </section>}
    {error && <p className="message error">{error}</p>}
    {searched && !error && <section id="results" className="results result-screen"><button type="button" className="back-button" onClick={() => { setSearched(false); setDraft(''); setRag(null); }}>← 다시 검색</button><div className="query-summary"><span>검색한 업무 상황</span><strong>{question}</strong>{site !== '미선택' && <small>{site} · {category}</small>}</div>{ragLoading && <p className="message notice">지침 문서를 검색하고 근거를 확인하는 중입니다…</p>}{rag && <RagPanel result={rag} />}{workflow && <section className="workflow"><div className="result-title"><div><p className="eyebrow">관련 규정 맞춤 해석</p><h2>{workflow.title}</h2></div><span className="threshold">적용 기준: {workflow.threshold}</span></div><div className="workflow-steps">{workflow.steps.map((step) => <article className="workflow-step" key={step.order}><span className="step-number">{step.order}</span><div><h3>{step.title}</h3><strong>주관: {step.owner}</strong><p>{step.detail}</p><small>{step.evidence}</small></div></article>)}</div><p className="message notice">{workflow.note}</p></section>}<div className="result-title"><div><p className="eyebrow">기존 규칙 기반 후보</p><h2>비교용 추천 결과</h2></div><p>실제 배정이나 최종 판단은 담당 부서 확인이 필요합니다.</p></div>{site === '미선택' && <p className="message notice">사업장을 선택하면 현장 담당 부서를 더 정확히 안내할 수 있습니다.</p>}{primary ? <div className="result-grid"><DepartmentCard department={primary} role="주관 후보" onDraft={createDraft} /><div className="partner-column"><h3>협업 후보</h3>{results.slice(1, 4).map((item) => <DepartmentCard key={item.id} department={item} role="협업 후보" compact onDraft={createDraft} />)}</div></div> : <div className="empty-state"><h3>일치하는 부서를 찾지 못했습니다.</h3><p>업무 유형을 선택하거나 설비·안전·구매·환경처럼 핵심 업무 단어를 추가해 주세요.</p></div>}</section>}
    {pendingDepartment && <section className="request-confirmation"><p className="eyebrow">검토 요청 확인</p><h2>관련 부서에 검토 요청을 할까요?</h2><p><strong>{pendingDepartment.name}</strong>에 사전 협의 내용을 준비합니다.</p><div className="confirmation-actions"><button type="button" onClick={confirmDraft}>예, 요청 내용 준비</button><button type="button" className="secondary" onClick={() => { setPendingDepartment(null); setDraft(''); setRequestClosed(true); }}>아니오</button></div></section>}
    {requestClosed && !pendingDepartment && !draft && <p className="message notice">검토 요청을 종료했습니다. 추가 전송이나 변경은 없습니다.</p>}
    {draft && <section className="draft"><div><p className="eyebrow">검토 요청 초안</p><h2>담당 부서에 보낼 내용을 준비하세요</h2><p className="draft-help">수신 부서와 업무 상황을 확인한 뒤 필요한 내용을 수정하고 복사할 수 있습니다. 이 데모는 외부로 전송하지 않습니다.</p></div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="검토 요청 초안" /><div><button type="button" onClick={async () => { await navigator.clipboard?.writeText(draft); setCopied(true); }}>초안 복사</button>{copied && <span className="copy-status"> 클립보드에 복사했습니다.</span>}</div><button type="button" className="send-button" onClick={() => setRequestStatus('검토 대기')}>요청 작성 완료 · 검토 대기로 이동</button></section>}
    {(requestStatus !== '작성중' || requestClosed) && <section className="request-tracker"><div className="tracker-heading"><div><p className="eyebrow">요청 상태</p><h2>현업 확인 현황</h2></div><span className={`status-pill ${requestStatus === '회신 완료' ? 'done' : 'waiting'}`}>{requestStatus}</span></div><div className="status-steps"><span className="complete">질문 입력</span><span className={requestStatus !== '작성중' ? 'complete' : ''}>메일 발송</span><span className={requestStatus === '회신 완료' ? 'complete' : 'current'}>현업 검토</span><span className={requestStatus === '회신 완료' ? 'complete' : ''}>회신 완료</span></div>{requestStatus === '검토 대기' && <button type="button" className="reply-tab" onClick={() => setRequestStatus('검토중')}>담당 부서 접수 확인 · 검토중으로 변경</button>}{requestStatus === '검토중' && <button type="button" className="reply-tab" onClick={() => setRequestStatus('회신 완료')}>현업 담당자: 확인 후 ‘회신 완료’로 변경</button>}{requestStatus === '회신 완료' && <p className="completed-note">현업 담당자가 확인하고 회신 완료 처리했습니다.</p>}</section>}
    <footer id="notice">출처: 260827_조직 및 책임권한 규정_업무분장_더미파일.docx · 본 화면은 파일 기반 데모입니다.</footer>
  </main>;
}

function RagPanel({ result }: { result: RagResult }) {
  return <section className="workflow rag-panel"><div className="result-title"><div><p className="eyebrow">LangChain RAG 근거 기반 추천</p><h2>{result.needsMoreInfo ? '추가 확인이 필요합니다' : result.owner}</h2></div><span className="threshold">주관 부서</span></div><p>{result.reason}</p><p><strong>협업 부서:</strong> {result.partners.length ? result.partners.join(' · ') : '확인되지 않음'}</p><div className="evidence"><span>검색된 지침 근거</span>{result.evidence.map((item, index) => <p key={`${item.source}-${index}`}>“{item.quote}”<small>{item.source}</small></p>)}</div></section>;
}

function DepartmentCard({ department, role, compact = false, onDraft }: { department: Match; role: string; compact?: boolean; onDraft: (department: Match) => void }) {
  const [label, className] = level(department.score);
  return <article className={`department-card ${compact ? 'compact' : 'primary'}`}><div className="card-meta"><span className="role">{role}</span><span className={`confidence ${className}`}>{label}</span></div><h3>{department.name}</h3><p className="parent">{department.parent}</p><p className="reason">{department.reasons.join(' · ')}</p><div className="evidence"><span>업무분장 근거</span><p>{department.responsibility}</p><small>{department.sourcePath}</small></div>{!compact && <button type="button" className="draft-button" onClick={() => onDraft(department)}>검토 요청 내용 준비</button>}</article>;
}
