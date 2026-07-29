import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CaretDown,
  ChartBar,
  Check,
  CheckCircle,
  Clock,
  Gear,
  House,
  MagnifyingGlass,
  Play,
  Seal,
  SlidersHorizontal,
  Target,
  Trophy,
  UserCircle,
  UsersThree,
  X,
} from "@phosphor-icons/react";

const problems = [
  { id: 1248, subject: "설비관리", unit: "펌프", type: "객관식", difficulty: "상", status: "공개", title: "원심펌프의 축방향 하중 원인으로 옳은 것은?", tag: "원인분석", created: "2026-07-29" },
  { id: 1247, subject: "안전관리", unit: "화재안전", type: "객관식", difficulty: "중", status: "공개", title: "다음 중 소화기의 적용 화재가 아닌 것은?", tag: "조치/예방", created: "2026-07-28" },
  { id: 1246, subject: "전기기초", unit: "회로이론", type: "주관식", difficulty: "중", status: "검토중", title: "교류 회로에서 유효전력(P)을 구하는 공식을 쓰시오.", tag: "계산", created: "2026-07-25" },
  { id: 1245, subject: "기계일반", unit: "재료역학", type: "객관식", difficulty: "하", status: "비공개", title: "힘 응력 곡선으로 옳은 것은?", tag: "기초", created: "2026-07-22" },
  { id: 1244, subject: "배관설계", unit: "배관재료", type: "객관식", difficulty: "중", status: "공개", title: "스테인리스강의 특징으로 옳은 것은?", tag: "기초", created: "2026-07-21" },
  { id: 1243, subject: "계장제어", unit: "제어밸브", type: "객관식", difficulty: "상", status: "공개", title: "제어밸브의 유량 특성곡선 종류가 아닌 것은?", tag: "원인분석", created: "2026-07-19" },
];

const navGroups = [
  { label: "홈", icon: House, screen: "home" },
  { label: "학습", icon: BookOpen, screen: "home", expandable: true },
  { label: "문제 운영", icon: SlidersHorizontal, screen: "problems", expandable: true },
  { label: "학습 현황", icon: ChartBar, screen: "home", expandable: true },
  { label: "마이페이지", icon: UserCircle, screen: "home" },
];

function Brand() {
  return (
    <div className="brand" aria-label="대륜 E&S">
      <Seal size={30} weight="fill" />
      <span>대륜 E&amp;S</span>
    </div>
  );
}

function Sidebar({ activeScreen, setActiveScreen }) {
  const renderNavItem = ({ label, icon: Icon, screen, expandable }) => (
    <button
      key={label}
      className={`nav-item ${activeScreen === screen ? "is-active" : ""}`}
      onClick={() => setActiveScreen(screen)}
    >
      <span className="nav-icon"><Icon size={18} weight={activeScreen === screen ? "fill" : "regular"} /></span>
      <span>{label}</span>
      {expandable && <CaretDown className="nav-caret" size={15} />}
    </button>
  );
  return (
    <aside className="sidebar">
      <div className="brand-block"><Brand /><span className="brand-caption">Learning Hub</span></div>
      <nav className="side-nav" aria-label="주 메뉴">
        <div className="nav-group"><p className="nav-label">주요 메뉴</p>{navGroups.slice(0, 2).map(renderNavItem)}</div>
        <div className="nav-group"><p className="nav-label">관리 메뉴</p>{navGroups.slice(2).map(renderNavItem)}</div>
      </nav>
      <div className="sidebar-bottom">
        <div className="tip-card">
          <Target size={22} weight="duotone" />
          <strong>학습 팁</strong>
          <p>짧은 학습도 꾸준히 실력을 만듭니다.</p>
          <button className="text-link">자세히 보기 <ArrowRight size={14} /></button>
        </div>
        <button className="nav-item muted"><Gear size={21} /><span>설정</span></button>
        <button className="nav-item muted"><UsersThree size={21} /><span>고객센터</span><CaretDown className="nav-caret" size={15} /></button>
      </div>
    </aside>
  );
}

function Topbar({ onSearch }) {
  const [query, setQuery] = useState("");
  return (
    <header className="topbar">
      <div className="mobile-brand"><Brand /></div>
      <div className="greeting"><strong>안녕하세요, 김대륜 사원님</strong><span>오늘도 한 걸음 더 성장해 보세요.</span></div>
      <label className="global-search">
        <MagnifyingGlass size={19} />
        <input value={query} onChange={(event) => { setQuery(event.target.value); onSearch(event.target.value); }} placeholder="문제 제목, 키워드 검색" aria-label="문제 제목, 키워드 검색" />
      </label>
      <button className="icon-button" aria-label="알림"><Bell size={21} /></button>
      <div className="profile"><UserCircle size={37} weight="duotone" /><span><strong>김대륜 사원</strong><small>설비관리팀</small></span><CaretDown size={16} /></div>
    </header>
  );
}

function ProgressPanel() {
  return (
    <section className="surface progress-panel">
      <div className="section-heading"><h2>나의 학습 현황</h2><button className="text-link">자세히 보기 <ArrowRight size={14} /></button></div>
      <div className="progress-summary">
        <div className="progress-number"><strong>72<span>%</span></strong><small>전체 진도율</small></div>
        <div className="progress-track vertical"><span style={{ height: "72%" }} /></div>
        <div className="progress-legend"><span><i className="dot blue" />완료 <b>36강</b></span><span><i className="dot aqua" />진행 중 <b>18강</b></span><span><i className="dot gray" />남은 강의 <b>14강</b></span></div>
      </div>
      <div className="progress-metrics"><div><Clock size={20} /><small>이번 주 학습 시간</small><strong>3시간 20분</strong></div><div><Target size={20} /><small>이번 주 목표</small><strong>5시간 / 6시간</strong><div className="mini-track"><span style={{ width: "83%" }} /></div></div></div>
    </section>
  );
}

function ContinueLearning({ onStart }) {
  return (
    <section className="surface continue-panel">
      <div className="section-heading"><h2>이어서 학습하기</h2><button className="text-link">전체 학습 보기 <ArrowRight size={14} /></button></div>
      <div className="continue-grid">
        <div className="course-card">
          <span className="course-badge">학습 중</span>
          <h3>개인정보보호 실무 마스터</h3>
          <p>3장. 개인정보의 수집과 이용</p>
          <div className="course-progress"><div><span>진도율</span><strong>68%</strong></div><div className="progress-track"><span style={{ width: "68%" }} /></div></div>
          <button className="light-action" onClick={onStart}>학습 이어가기 <ArrowRight size={18} /></button>
        </div>
        <div className="next-list"><h3>다음 학습 목록</h3>{["4장. 개인정보의 제3자 제공", "5장. 개인정보보호를 위한 기술적 조치", "6장. 위반 사례와 예방"].map((item, index) => <button key={item} className="next-item"><span className="round-icon"><BookOpen size={16} /></span><span>{item}<small>예상 {18 + index * 4}분</small></span><ArrowRight size={15} /></button>)}<button className="text-link all-course">전체 커리큘럼 보기 <ArrowRight size={14} /></button></div>
      </div>
    </section>
  );
}

function RecommendedSet({ onStart }) {
  return (
    <section className="surface recommended-panel">
      <div className="section-heading"><div><h2>추천 문제 세트</h2><p>실력 점검을 위한 맞춤 문제를 풀어보세요.</p></div><button className="text-link">전체 문제 운영 <ArrowRight size={14} /></button></div>
      <div className="recommend-content">
        <div className="recommend-visual"><CheckCircle size={46} weight="duotone" /></div>
        <div className="recommend-copy"><span className="aqua-chip">큐레이션</span><h3>개인정보보호 핵심 점검 세트</h3><p>핵심 개념과 실무 사례를 중심으로 구성된 실력 점검용 문제 세트입니다.</p><div className="tag-row"><span>객관식</span><span>20문제</span><span>난이도 중</span></div></div>
        <div className="recommend-actions"><button className="primary-button" onClick={onStart}>문제 풀기 <ArrowRight size={18} /></button><button className="secondary-button">상세 보기</button></div>
      </div>
      <div className="carousel-dots"><i className="active" /><i /><i /><i /></div>
    </section>
  );
}

function RecentActivity() {
  const activity = [
    ["개인정보보호 실무 마스터", "3장. 개인정보의 수집과 이용", "진도율 68%", "blue", BookOpen],
    ["안전관리 실무 가이드", "2장. 위험성 평가의 이해", "진도율 100%", "aqua", Check],
    ["전기기초 핵심 이론", "1장. 전기의 기초 개념", "진도율 45%", "blue", BookOpen],
  ];
  return <section className="surface recent-panel"><div className="section-heading"><h2>최근 학습 활동</h2><button className="text-link">전체 보기 <ArrowRight size={14} /></button></div>{activity.map(([title, sub, progress, tone, Icon]) => <div className="activity-row" key={title}><span className={`activity-icon ${tone}`}><Icon size={19} weight="duotone" /></span><span><strong>{title}</strong><small>{sub}</small></span><b>{progress}</b></div>)}<button className="text-link centered-link">더보기 <ArrowRight size={14} /></button></section>;
}

function RoutinePanel() {
  return <section className="surface routine-panel"><div><h2>나의 학습 루틴</h2><p>일일 학습 목표를 달성하고 배지를 획득해 보세요.</p></div><div className="routine-stat"><span className="routine-icon"><Clock size={22} /></span><span><small>연속 학습</small><strong>3일 연속</strong></span></div><div className="routine-stat"><span className="routine-icon"><Target size={22} /></span><span><small>일일 목표</small><strong>40분 / 60분</strong><div className="mini-track"><span style={{ width: "66%" }} /></div></span></div><div className="routine-stat"><span className="routine-icon"><Trophy size={22} /></span><span><small>획득 배지</small><strong>12개</strong></span></div></section>;
}

function Home({ onStart }) {
  return <div className="page-content home-page"><div className="dashboard-grid"><ContinueLearning onStart={onStart} /><ProgressPanel /><RecommendedSet onStart={onStart} /><RecentActivity /></div><RoutinePanel /></div>;
}

function Difficulty({ value }) { return <span className={`difficulty ${value === "상" ? "high" : value === "하" ? "low" : "mid"}`}><i />{value}</span>; }

function ProblemBank({ search }) {
  const [subject, setSubject] = useState("전체");
  const [tag, setTag] = useState("전체");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState(null);
  const filtered = useMemo(() => problems.filter((problem) => {
    const matchesSearch = !search || `${problem.title} ${problem.subject} ${problem.tag}`.includes(search);
    const matchesSubject = subject === "전체" || problem.subject === subject;
    const matchesTag = tag === "전체" || problem.tag === tag;
    const matchesFrom = !from || problem.created >= from;
    const matchesTo = !to || problem.created <= to;
    return matchesSearch && matchesSubject && matchesTag && matchesFrom && matchesTo;
  }), [search, subject, tag, from, to]);
  return <div className="page-content problem-page">
    <div className="page-title-row"><div><span className="eyebrow">문제 운영</span><h1>문제 목록</h1><p>등록된 문제를 조회하고 관리할 수 있습니다.</p></div><button className="primary-button"><Play size={16} weight="fill" /> 문제 등록</button></div>
    <section className="surface filter-panel">
      <div className="filter-top"><label className="filter-search"><MagnifyingGlass size={18} /><input placeholder="문제 제목, 키워드 검색" value={search} readOnly /></label><button className="secondary-button"><SlidersHorizontal size={17} /> 상세 검색 열기</button></div>
      <div className="filter-grid"><label>과목<select value={subject} onChange={(e) => setSubject(e.target.value)}><option>전체</option><option>설비관리</option><option>안전관리</option><option>전기기초</option><option>기계일반</option></select></label><label>단원<select><option>전체</option><option>펌프</option><option>화재안전</option><option>회로이론</option></select></label><label>문제 유형<select><option>전체</option><option>객관식</option><option>주관식</option></select></label><label>난이도<select><option>전체</option><option>상</option><option>중</option><option>하</option></select></label><label>상태<select><option>전체</option><option>공개</option><option>검토중</option></select></label></div>
      <div className="filter-bottom"><div className="date-filter"><span>등록일</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="등록일 시작" /><span>~</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="등록일 종료" /></div><div className="filter-actions"><button className="secondary-button" onClick={() => { setSubject("전체"); setTag("전체"); setFrom(""); setTo(""); }}>초기화</button><button className="primary-button">조회</button></div></div>
      <div className="tag-filter"><span>태그</span>{["전체", "원인분석", "조치/예방", "계산", "기초"].map((item) => <button key={item} className={tag === item ? "selected" : ""} onClick={() => setTag(item)}>{item}</button>)}</div>
    </section>
    <div className="table-toolbar"><strong>전체 <span>{filtered.length}</span>건</strong><div><button className="secondary-button">엑셀 다운로드</button><button className="primary-button"><Play size={15} weight="fill" /> 문제 등록</button></div></div>
    <section className="surface table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="전체 선택" /></th><th>번호</th><th>과목</th><th>단원</th><th>문제 유형</th><th>난이도</th><th>문제 제목</th><th>태그</th><th>상태</th><th>등록자</th><th /></tr></thead><tbody>{filtered.map((problem) => <tr key={problem.id} className={selected === problem.id ? "selected-row" : ""} onClick={() => setSelected(problem.id)}><td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`${problem.id} 선택`} /></td><td>{problem.id}</td><td>{problem.subject}</td><td>{problem.unit}</td><td>{problem.type}</td><td><Difficulty value={problem.difficulty} /></td><td className="problem-title">{problem.title}</td><td><span className="table-tag">{problem.tag}</span></td><td><span className={`status ${problem.status === "공개" ? "published" : "review"}`}>{problem.status}</span></td><td>김대륜</td><td><button className="row-menu" aria-label="문제 메뉴">•••</button></td></tr>)}</tbody></table><div className="table-footer"><button className="page-arrow">‹</button><button className="page-number active">1</button><button className="page-number">2</button><button className="page-number">3</button><span>...</span><button className="page-number">125</button><button className="page-arrow">›</button><select aria-label="페이지 표시 개수"><option>10개씩 보기</option><option>20개씩 보기</option></select></div></section>
    {selected && <div className="selection-toast"><CheckCircle size={18} weight="fill" /> 문제 {selected}번을 선택했습니다.<button onClick={() => setSelected(null)} aria-label="선택 닫기"><X size={16} /></button></div>}
  </div>;
}

function Quiz({ onBack }) {
  const [choice, setChoice] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  return <div className="page-content quiz-page"><button className="back-link" onClick={onBack}>‹ 문제 목록으로</button><div className="quiz-layout"><section className="surface quiz-card"><div className="quiz-meta"><span>문제 1 / 20</span><span className="aqua-chip">객관식</span></div><div className="quiz-progress"><span style={{ width: "5%" }} /></div><span className="eyebrow">개인정보보호 실무 마스터</span><h1>다음 중 개인정보의 제3자 제공에 대한 설명으로 옳은 것은?</h1><p className="quiz-helper">가장 적절한 답을 하나 선택해 주세요.</p><div className="choice-list">{["정보주체의 동의 없이 언제나 제공할 수 있다.", "법률에 특별한 규정이 있는 경우 제공할 수 있다.", "제공받는 자의 요청만으로 제공할 수 있다.", "모든 개인정보는 제3자 제공이 금지된다."].map((item, index) => <button className={`choice ${choice === index ? "selected" : ""}`} key={item} onClick={() => setChoice(index)}><span>{String.fromCharCode(65 + index)}</span><b>{item}</b>{choice === index && <Check size={18} weight="bold" />}</button>)}</div><div className="quiz-actions"><button className="secondary-button" onClick={onBack}>나중에 풀기</button><button className="primary-button" disabled={choice === null} onClick={() => setSubmitted(true)}>답안 제출 <ArrowRight size={18} /></button></div>{submitted && <div className="answer-feedback"><CheckCircle size={22} weight="fill" /><div><strong>정답입니다.</strong><p>개인정보 보호법에 따라 법률에 특별한 규정이 있는 경우 제공할 수 있습니다.</p></div></div>}</section><aside className="surface quiz-side"><span className="eyebrow">현재 학습</span><h2>개인정보보호 실무 마스터</h2><div className="quiz-side-row"><span>진행률</span><strong>5%</strong></div><div className="progress-track"><span style={{ width: "5%" }} /></div><div className="quiz-side-row"><span>남은 문제</span><strong>19문제</strong></div><button className="text-link">학습 현황 보기 <ArrowRight size={14} /></button></aside></div></div>;
}

export function App() {
  const [activeScreen, setActiveScreen] = useState("home");
  const [search, setSearch] = useState("");
  const startQuiz = () => setActiveScreen("quiz");
  return <div className="app-shell"><Sidebar activeScreen={activeScreen} setActiveScreen={setActiveScreen} /><div className="app-main"><Topbar onSearch={setSearch} />{activeScreen === "home" && <Home onStart={startQuiz} />}{activeScreen === "problems" && <ProblemBank search={search} />}{activeScreen === "quiz" && <Quiz onBack={() => setActiveScreen("home")} />}</div></div>;
}
