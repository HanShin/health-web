'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Clock,
  Footprints,
  Heart,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Scale,
  Settings2,
  ShieldCheck,
  Sun,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  dayOf,
  filterPeriod,
  formatDuration,
  formatNumber,
  latestMetric,
  metric,
  metricNames,
  num,
  runningSummary,
  sourceNames,
  sourceGroup,
  sourceLabel,
  valueFor,
  type Connection,
  type Device,
  type HealthRecord,
  type Source,
  type SyncRun,
} from '@/lib/health';
import { parseHealthTask, splitDetail, ingestionBatches, importBatchId } from '@/lib/import';
import { SamsungRecords } from './samsung-records';
const tabs = [
  { id: 'overview', name: '종합 대시보드', icon: LayoutDashboard },
  { id: 'sleep', name: '수면 · 회복', icon: Moon },
  { id: 'activity', name: '활동 · 러닝', icon: Footprints },
  { id: 'body', name: '체성분', icon: Scale },
  { id: 'settings', name: '연결 · 설정', icon: Link2 },
] as const;
type Tab = (typeof tabs)[number]['id'];
type Props = {
  demo: boolean;
  email: string;
  records: HealthRecord[];
  connections: Connection[];
  runs: SyncRun[];
  devices: Device[];
  loadError?: string;
  initialTab?: Tab;
  initialMessage?: string;
};
export function Dashboard({
  demo,
  email,
  records,
  connections,
  runs,
  devices,
  loadError,
  initialTab,
  initialMessage,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview'),
    [days, setDays] = useState(30),
    [source, setSource] = useState('all'),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState(initialMessage ?? ''),
    [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null),
    [ouraAuthorization, setOuraAuthorization] = useState(''),
    [bodyMetric, setBodyMetric] = useState('WEIGHT_KG');
  const selected = useMemo(
    () => filterPeriod(records, days).filter((r) => source === 'all' || sourceGroup(r) === source),
    [records, days, source],
  );
  const summary = runningSummary(selected),
    oura = (keys: string[]) => latestMetric(selected, keys, 'oura'),
    sleep = oura(['sleep_duration']),
    ready = oura(['readiness_score']),
    hrv = oura(['hrv']),
    weight = latestMetric(selected, ['WEIGHT_KG', 'weight']);
  const latestAt = records.length
    ? records.reduce((v, r) => (r.measured_at > v ? r.measured_at : v), records[0].measured_at)
    : null;
  const connectionFor = (s: string) => connections.find((c) => (c.source ?? c.provider) === s);
  async function action(name: string, body: Record<string, unknown> = {}) {
    setBusy(name);
    setMessage('');
    if (name === 'oura') setOuraAuthorization('');
    try {
      const response = await fetch(`/api/connect/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? '요청을 처리하지 못했습니다.');
      if (typeof result.url === 'string') setOuraAuthorization(result.url);
      else if (result.code) setPair(result);
      else {
        setMessage('요청이 완료되었습니다. 새로고침하면 최신 상태를 확인할 수 있습니다.');
        router.refresh();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setBusy('');
    }
  }
  async function importFile(file: File) {
    setBusy('import');
    setMessage('');
    try {
      if (file.size > 100 * 1024 * 1024) throw Error('100MB 이하의 파일을 선택해 주세요.');
      const parsed = parseHealthTask(JSON.parse(await file.text()));
      let count = 0;
      for (const record of parsed) {
        const split = await splitDetail(record);
        for (const batch of ingestionBatches(split)) {
          const response = await fetch('/api/connect/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              version: 1,
              batchId: await importBatchId(batch),
              records: batch,
            }),
          });
          if (!response.ok) {
            const error = await response.json();
            throw Error(error.error ?? '저장에 실패했습니다. 같은 파일로 다시 시도할 수 있습니다.');
          }
        }
        count++;
        setMessage(`${count} / ${parsed.length}개 원본 기록 가져오는 중…`);
      }
      setMessage(`${count}개 기록을 가져왔습니다.`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '파일을 읽지 못했습니다.');
    } finally {
      setBusy('');
    }
  }
  const now = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href={demo ? '/demo' : '/'} className="brand">
          <span className="brand-mark">
            h<span>✳</span>
          </span>
          <span>
            오늘의 건강<small>MY HEALTH SPACE</small>
          </span>
        </Link>
        <div className="workspace">
          <span className="avatar">나</span>
          <div>
            나의 건강 공간<small>PERSONAL WORKSPACE</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => {
                setTab(t.id);
                setMessage('');
              }}
            >
              <t.icon size={19} />
              {t.name}
              {tab === t.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={19} />
            <strong>나만의 건강 기록</strong>
            <p>
              연결된 데이터는 나의 공간에서
              <br />
              안전하게 관리해요.
            </p>
          </div>
          <div className="profile">
            <span className="avatar">{demo ? 'D' : '나'}</span>
            <div>
              {demo ? '데모 둘러보기' : '개인 계정'}
              <small title={email}>{email}</small>
            </div>
            {demo ? (
              <Link href="/login" aria-label="로그인">
                <ArrowUpRight size={17} />
              </Link>
            ) : (
              <button
                aria-label="로그아웃"
                onClick={async () => {
                  await fetch('/api/logout', { method: 'POST' });
                  router.push('/login');
                  router.refresh();
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">내 건강 공간</span>
            <span className="separator">/</span>
            <strong>{tabs.find((t) => t.id === tab)?.name}</strong>
          </div>
          <div className="topbar-right">
            <span className="status-dot" />
            {demo ? '샘플 데이터' : '개인 데이터'}
            <span className="topbar-divider" />
            <span className="avatar small">나</span>
          </div>
        </header>
        <main className="main-content">
          {demo && (
            <div className="demo-banner">
              <span>
                <Zap size={14} />
                데모 모드 · 모든 수치는 샘플 데이터입니다.
              </span>
              <Link href="/login">
                내 데이터 연결하기 <ArrowRight size={14} />
              </Link>
            </div>
          )}
          {loadError && (
            <div role="alert" className="notice error">
              {loadError}
            </div>
          )}
          {message && (
            <div role="status" className="notice">
              {busy && <LoaderCircle size={15} className="spin" />}
              {message}
              <button className="icon-button" onClick={() => setMessage('')} aria-label="알림 닫기">
                <X size={15} />
              </button>
            </div>
          )}
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="tiny-line" />
                {now}
              </div>
              <h1>
                {tab === 'overview'
                  ? '오늘도, 나를 알아가는 시간.'
                  : tab === 'sleep'
                    ? '잘 쉬고, 더 나은 하루로.'
                    : tab === 'activity'
                      ? '움직임이 쌓이는 시간.'
                      : tab === 'body'
                        ? '숫자로 보는 나의 변화.'
                        : '흩어진 기록을 하나로.'}
              </h1>
              <p>
                {tab === 'settings'
                  ? '데이터 소스를 연결하고 동기화 상태를 확인하세요.'
                  : '매일의 작은 기록을 모아, 나의 건강 흐름을 확인하세요.'}
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() =>
                demo
                  ? setMessage('데모에서는 실제 데이터를 수집하지 않습니다.')
                  : window.location.reload()
              }
            >
              <RefreshCw size={15} />
              새로고침
            </button>
          </section>
          {tab !== 'settings' && (
            <div className="filterbar">
              <div className="periods">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    className={days === d ? 'selected' : ''}
                    onClick={() => setDays(d)}
                  >
                    최근 {d}일
                  </button>
                ))}
              </div>
              <div className="filter-right">
                <span className="timezone">Asia/Seoul</span>
                <label className="select-wrap">
                  <Settings2 size={14} />
                  <select
                    aria-label="데이터 출처"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="all">모든 데이터 소스</option>
                    {Object.entries(sourceNames).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
          {(tab === 'overview' || tab === 'sleep') && (
            <>
              <div className="metric-grid">
                <MetricCard
                  title="수면 시간"
                  value={sleep ? formatDuration(sleep.value * 1000) : '—'}
                  icon={<Moon size={18} />}
                  source="Oura Ring"
                  note={
                    sleep
                      ? `${dayOf(sleep.record.measured_at)} · 최근 측정`
                      : '연결된 수면 기록이 없어요'
                  }
                  color="purple"
                />
                <MetricCard
                  title="오늘의 준비도"
                  value={ready ? `${ready.value}` : '—'}
                  suffix={ready ? '점' : undefined}
                  icon={<Zap size={18} />}
                  source="Oura Ring"
                  note={ready ? '가장 최근 준비도 점수' : '아직 측정된 값이 없어요'}
                  color="lime"
                />
                <MetricCard
                  title="평균 HRV"
                  value={formatNumber(hrv?.value ?? null)}
                  suffix={hrv ? 'ms' : undefined}
                  icon={<Heart size={18} />}
                  source="Oura Ring"
                  note={hrv ? '가장 최근 야간 평균' : '연결된 HRV 기록이 없어요'}
                  color="pink"
                />
                <MetricCard
                  title={tab === 'sleep' ? '안정 심박' : '최근 체중'}
                  value={formatNumber(
                    tab === 'sleep'
                      ? (oura(['resting_heart_rate'])?.value ?? null)
                      : (weight?.value ?? null),
                    tab === 'sleep' ? 0 : 1,
                  )}
                  suffix={
                    (tab === 'sleep' ? oura(['resting_heart_rate']) : weight)
                      ? tab === 'sleep'
                        ? 'bpm'
                        : 'kg'
                      : undefined
                  }
                  icon={tab === 'sleep' ? <Activity size={18} /> : <Scale size={18} />}
                  source={
                    tab === 'sleep'
                      ? 'Oura Ring'
                      : weight
                        ? sourceLabel(weight.record)
                        : '인바디 · 삼성 헬스'
                  }
                  note="선택 기간 내 최근 측정"
                  color="blue"
                />
              </div>
              <div className="content-grid">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>수면과 회복의 흐름</h2>
                      <p>하루하루 쌓인 회복의 리듬을 살펴보세요.</p>
                    </div>
                    <span className="source-tag">
                      <span className="source-dot purple-dot" />
                      Oura Ring
                    </span>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i className="purple-dot" />
                      수면 점수
                    </span>
                    <span>
                      <i className="lime-dot" />
                      준비도
                    </span>
                    <small>단위: 점</small>
                  </div>
                  <Trend
                    records={selected.filter((r) => r.source === 'oura')}
                    lines={[
                      { key: 'sleep_score', color: '#9d8bd4', name: '수면 점수' },
                      { key: 'readiness_score', color: '#a1bb46', name: '준비도' },
                    ]}
                  />
                </section>
                <section className="panel recovery-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>나의 회복 스냅샷</h2>
                      <p>Oura의 가장 최근 기록</p>
                    </div>
                    <Sun size={20} />
                  </div>
                  <div className="score-orbit">
                    <svg viewBox="0 0 180 180" aria-hidden="true">
                      <circle cx="90" cy="90" r="76" className="ring-bg" />
                      <circle
                        cx="90"
                        cy="90"
                        r="76"
                        className="ring-value"
                        strokeDasharray={`${Math.max(0, Math.min(100, ready?.value ?? 0)) * 4.775} 477.5`}
                      />
                    </svg>
                    <div>
                      <span>READINESS</span>
                      <strong>{ready?.value ?? '—'}</strong>
                      <small>준비도 점수</small>
                    </div>
                  </div>
                  <div className="recovery-foot">
                    <span className="status-dot" />
                    {ready
                      ? '원본 기기가 제공한 회복 지표입니다.'
                      : 'Oura를 연결하면 회복 지표를 볼 수 있어요.'}
                  </div>
                </section>
              </div>
            </>
          )}
          {(tab === 'overview' || tab === 'activity') && (
            <div className="content-grid lower-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      나의 활동 기록 <span className="count-chip">{summary.runs.length}</span>
                    </h2>
                    <p>선택한 기간의 러닝 기록이에요.</p>
                  </div>
                  {tab === 'overview' && (
                    <button className="text-button" onClick={() => setTab('activity')}>
                      전체 보기 <ArrowUpRight size={15} />
                    </button>
                  )}
                </div>
                <div className="activity-totals">
                  <div>
                    <span>총 거리</span>
                    <strong>
                      {formatNumber(summary.distance === null ? null : summary.distance / 1000, 1)}
                      <small>km</small>
                    </strong>
                  </div>
                  <div>
                    <span>활동 시간</span>
                    <strong className="duration-total">{formatDuration(summary.duration)}</strong>
                  </div>
                  <div>
                    <span>러닝 횟수</span>
                    <strong>
                      {summary.runs.length}
                      <small>회</small>
                    </strong>
                  </div>
                </div>
                {summary.runs.length ? (
                  <div className="run-list">
                    {summary.runs.slice(0, tab === 'overview' ? 3 : 30).map((r) => (
                      <div className="run-row" key={r.source + r.external_id}>
                        <span className="run-icon">
                          <Footprints size={19} />
                        </span>
                        <div className="run-info">
                          <strong>
                            {String(
                              r.data.title ??
                                (r.data.record as { session?: { title?: string } } | undefined)
                                  ?.session?.title ??
                                '러닝',
                            )}
                          </strong>
                          <small>
                            {dayOf(r.measured_at)} <span>·</span> {sourceLabel(r)}
                          </small>
                        </div>
                        <div className="run-distance">
                          {formatNumber(
                            num(r.data.distanceMeters) === null
                              ? null
                              : Number(r.data.distanceMeters) / 1000,
                            2,
                          )}{' '}
                          <small>km</small>
                          <span>{formatDuration(num(r.data.activeDurationMillis))}</span>
                        </div>
                        <ArrowUpRight size={16} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty text="아직 러닝 기록이 없어요" />
                )}
              </section>
              <section className="panel body-preview">
                <div className="panel-heading">
                  <div>
                    <h2>체성분 변화</h2>
                    <p>최근 체중의 흐름</p>
                  </div>
                  {tab === 'overview' && (
                    <button
                      className="text-button"
                      onClick={() => setTab('body')}
                      aria-label="체성분 전체 보기"
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  )}
                </div>
                <div className="body-number">
                  {formatNumber(weight?.value ?? null, 1)}
                  <span>kg</span>
                  <small>가장 최근 측정</small>
                </div>
                <Trend
                  records={selected.filter(
                    (r) => metric(r) === 'WEIGHT_KG' || metric(r) === 'weight',
                  )}
                  lines={[
                    {
                      key: metric(weight?.record ?? ({ data: {} } as HealthRecord)) || 'WEIGHT_KG',
                      color: '#78929d',
                      name: '체중',
                    },
                  ]}
                  compact
                />
                <div className="source-caption">같은 날 여러 측정값도 원본으로 보존합니다.</div>
              </section>
            </div>
          )}
          {tab === 'activity' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>걸음의 흐름</h2>
                  <p>
                    출처별 측정 구간의 걸음 수입니다. 서로 다른 출처와 겹치는 구간을 합산하지
                    않습니다.
                  </p>
                </div>
              </div>
              {(['oura', 'health_connect'] as Source[])
                .filter((s) => source === 'all' || source === s)
                .map((s) => (
                  <div key={s}>
                    <h3 className="subheading">{sourceNames[s]}</h3>
                    <Trend
                      records={selected.filter((r) => sourceGroup(r) === s)}
                      lines={[
                        {
                          key: 'steps',
                          color: s === 'oura' ? '#a1bb46' : '#78929d',
                          name: '걸음 수',
                        },
                      ]}
                    />
                  </div>
                ))}
            </section>
          )}
          {tab === 'sleep' && <SamsungRecords records={selected} />}
          {tab === 'body' && (
            <>
              <div className="metric-grid body-metrics">
                {[
                  ['WEIGHT_KG', '체중', 'kg'],
                  ['BODY_FAT_PERCENT', '체지방률', '%'],
                  ['SKELETAL_MUSCLE_KG', '골격근량', 'kg'],
                ].map(([key, title, unit]) => {
                  const v = latestMetric(selected, [key]);
                  return (
                    <MetricCard
                      key={key}
                      title={title}
                      value={formatNumber(v?.value ?? null, 1)}
                      suffix={v ? unit : undefined}
                      icon={<Scale size={18} />}
                      source={v ? sourceLabel(v.record) : '연결 대기'}
                      note={v ? dayOf(v.record.measured_at) : '측정된 기록이 없어요'}
                      color="blue"
                    />
                  );
                })}
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>체성분 추이</h2>
                    <p>측정 시각과 출처를 함께 확인하세요.</p>
                  </div>
                  <select
                    aria-label="체성분 항목"
                    value={bodyMetric}
                    onChange={(e) => setBodyMetric(e.target.value)}
                  >
                    {Array.from(
                      new Set([
                        'WEIGHT_KG',
                        'BODY_FAT_PERCENT',
                        'SKELETAL_MUSCLE_KG',
                        ...selected
                          .filter((r) => r.kind === 'measurement' && num(r.data.value) !== null)
                          .map(metric),
                      ]),
                    )
                      .filter(Boolean)
                      .map((m) => (
                        <option key={m} value={m}>
                          {metricNames[m] ?? m}
                        </option>
                      ))}
                  </select>
                </div>
                {(['health_task', 'health_connect'] as Source[])
                  .filter((s) => source === 'all' || source === s)
                  .map((s) => (
                    <div key={s}>
                      <h3 className="subheading">{sourceNames[s]}</h3>
                      <Trend
                        records={selected.filter(
                          (r) => sourceGroup(r) === s && metric(r) === bodyMetric,
                        )}
                        lines={[
                          {
                            key: bodyMetric,
                            color: '#78929d',
                            name: metricNames[bodyMetric] ?? bodyMetric,
                          },
                        ]}
                      />
                    </div>
                  ))}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>측정 기록</h2>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>측정일</th>
                        <th>항목</th>
                        <th>측정값</th>
                        <th>출처</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected
                        .filter((r) => r.kind === 'measurement' && num(r.data.value) !== null)
                        .slice(0, 100)
                        .map((r) => (
                          <tr key={r.source + r.external_id}>
                            <td>
                              {new Date(r.measured_at).toLocaleString('ko-KR', {
                                timeZone: 'Asia/Seoul',
                              })}
                            </td>
                            <td>{metricNames[metric(r)] ?? metric(r)}</td>
                            <td>
                              {formatNumber(num(r.data.value), 1)} {String(r.data.unit ?? '')}
                            </td>
                            <td>{sourceLabel(r)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!selected.some((r) => r.kind === 'measurement') && (
                  <Empty text="체성분 기록을 연결해 주세요" />
                )}
              </section>
            </>
          )}
          {tab === 'settings' && (
            <>
              <section className="connection-grid">
                {(
                  [
                    {
                      source: 'oura',
                      title: 'Oura Ring',
                      text: '수면 · 준비도 · 활동 · 심박 · HRV',
                      icon: <Moon size={24} />,
                      color: 'purple',
                    },
                    {
                      source: 'health_task',
                      title: '오늘러닝 · 인바디',
                      text: '러닝 · 경로 · 센서 · 체성분 원본',
                      icon: <Footprints size={24} />,
                      color: 'lime',
                    },
                    {
                      source: 'health_connect',
                      title: '삼성 헬스',
                      text: 'Android Health Connect를 통해 수집',
                      icon: <Heart size={24} />,
                      color: 'blue',
                    },
                    {
                      source: 'apple_health',
                      title: '애플 건강',
                      text: '후속 iOS 앱 또는 수집 앱 연동 예정',
                      icon: <Activity size={24} />,
                      color: 'pink',
                    },
                  ] as const
                ).map((c) => {
                  const state = connectionFor(c.source),
                    connected = demo
                      ? c.source !== 'apple_health'
                      : state?.status === 'connected' ||
                        (c.source === 'health_task' && devices.some((d) => !d.revoked_at));
                  return (
                    <article key={c.source} className="panel connection-card">
                      <div className="connection-top">
                        <span className={`metric-icon ${c.color}`}>{c.icon}</span>
                        <span className={`connection-status ${connected ? 'connected' : ''}`}>
                          {c.source === 'apple_health'
                            ? '준비 중'
                            : connected
                              ? '연결됨'
                              : state?.status === 'error'
                                ? '오류'
                                : state?.status === 'reauthorize'
                                  ? '재연결 필요'
                                  : '연결 대기'}
                        </span>
                      </div>
                      <h2>{c.title}</h2>
                      <p>{c.text}</p>
                      <small>
                        {state?.last_synced_at
                          ? `최근 동기화 ${new Date(state.last_synced_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
                          : c.source === 'health_connect'
                            ? '오늘러닝 앱에서 읽기 권한을 허용해 주세요.'
                            : '연결 후 데이터가 표시됩니다.'}
                      </small>
                      {state?.last_error && <p className="error-text">{state.last_error}</p>}
                      <div className="connection-actions">
                        {c.source === 'oura' ? (
                          <>
                            <button
                              disabled={demo || !!busy}
                              className="button secondary"
                              onClick={() => action(connected ? 'sync' : 'oura')}
                            >
                              {busy === 'sync' ? (
                                <LoaderCircle size={15} className="spin" />
                              ) : connected ? (
                                <RefreshCw size={15} />
                              ) : (
                                <Plus size={15} />
                              )}{' '}
                              {connected ? '지금 동기화' : 'Oura 연결'}
                            </button>
                            {connected && !demo && (
                              <button
                                className="text-button"
                                disabled={!!busy}
                                onClick={() => {
                                  if (confirm('Oura 연결을 해제할까요? 저장된 기록은 유지됩니다.'))
                                    action('disconnect');
                                }}
                              >
                                연결 해제
                              </button>
                            )}
                          </>
                        ) : c.source === 'health_task' ? (
                          <button
                            className="button secondary"
                            disabled={demo || !!busy}
                            onClick={() => action('pair')}
                          >
                            <Link2 size={15} />
                            기기 연결 코드 발급
                          </button>
                        ) : (
                          <span className="muted">
                            {c.source === 'apple_health'
                              ? '공통 수집 API 준비'
                              : '모바일 앱에서 연결'}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
              {ouraAuthorization && (
                <section className="panel pairing" aria-label="Oura 연결 계속하기">
                  <div>
                    <h2>Oura에서 연결을 승인해 주세요</h2>
                    <p>
                      인증 페이지를 열어 수면·활동·심박 기록 연결에 동의해 주세요. 이 브라우저에서
                      로그인이 어려우면 연결 주소를 복사해 평소 사용하는 브라우저에서 열 수 있어요.
                    </p>
                    <div className="connection-actions">
                      <a
                        className="button secondary"
                        href={ouraAuthorization}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        Oura 인증 페이지 열기 <ArrowUpRight size={15} />
                      </a>
                      <button
                        className="button secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(ouraAuthorization);
                            setMessage(
                              'Oura 연결 주소를 복사했습니다. 다른 브라우저에서 열어 주세요.',
                            );
                          } catch {
                            setMessage(
                              '인증 페이지 링크를 길게 누르거나 우클릭해 주소를 복사해 주세요.',
                            );
                          }
                        }}
                      >
                        연결 주소 복사
                      </button>
                    </div>
                    <small>
                      주소는 10분간 유효해요. 연결을 완료한 뒤 이 화면을 새로고침해 주세요.
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Oura 연결 안내 닫기"
                    onClick={() => setOuraAuthorization('')}
                  >
                    <X />
                  </button>
                </section>
              )}
              {pair && (
                <section className="panel pairing" role="status">
                  <div>
                    <h2>오늘러닝 앱에 연결 코드를 입력하세요</h2>
                    <p>설정 → 클라우드 동기화 → 웹 연결 코드</p>
                    <strong>{pair.code}</strong>
                    <button
                      className="button secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(pair.code);
                          setMessage('연결 코드를 복사했습니다.');
                        } catch {
                          setMessage('코드를 길게 선택해 복사해 주세요.');
                        }
                      }}
                    >
                      코드 복사
                    </button>
                    <small>
                      만료: {new Date(pair.expiresAt).toLocaleTimeString('ko-KR')} · 한 번만 사용할
                      수 있어요.
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="코드 닫기"
                    onClick={() => setPair(null)}
                  >
                    <X />
                  </button>
                </section>
              )}
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>연결된 기기</h2>
                    <p>기기별 업로드 권한을 관리하세요.</p>
                  </div>
                </div>
                {devices
                  .filter((d) => !d.revoked_at)
                  .map((d) => (
                    <div className="device-row" key={d.id}>
                      <span>
                        <strong>{d.name}</strong>
                        <small>
                          {d.last_seen_at
                            ? `최근 접속 ${new Date(d.last_seen_at).toLocaleString('ko-KR')}`
                            : '첫 동기화 대기'}
                        </small>
                      </span>
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() => {
                          if (confirm('기기의 업로드 권한을 해제할까요?'))
                            action('revoke', { deviceId: d.id });
                        }}
                      >
                        연결 해제
                      </button>
                    </div>
                  ))}
                {!devices.some((d) => !d.revoked_at) && (
                  <Empty
                    text={demo ? '데모에서는 기기를 연결하지 않아요' : '연결된 기기가 없습니다'}
                  />
                )}
              </section>
              <section className="panel import-panel">
                <span className="import-icon">
                  <Upload size={24} />
                </span>
                <div>
                  <h2>오늘러닝 JSON 가져오기</h2>
                  <p>
                    설정에서 내보낸 상세 데이터 JSON을 가져오세요. 기존 기록은 중복 저장하지
                    않습니다.
                  </p>
                  <small>schemaVersion 5 · analysis 3 · 최대 100MB</small>
                </div>
                <label className={`button secondary ${demo || busy ? 'disabled' : ''}`}>
                  <Upload size={15} />
                  {busy === 'import' ? '가져오는 중…' : '파일 선택'}
                  <input
                    type="file"
                    accept=".json,application/json"
                    disabled={demo || !!busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>동기화 이력</h2>
                    <p>최근 수집 결과와 오류를 확인하세요.</p>
                  </div>
                </div>
                {runs.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>시간</th>
                          <th>출처</th>
                          <th>상태</th>
                          <th>상세</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((r) => (
                          <tr key={r.id}>
                            <td>{new Date(r.started_at).toLocaleString('ko-KR')}</td>
                            <td>
                              {sourceNames[(r.source ?? r.provider) as Source] ??
                                r.source ??
                                r.provider}
                            </td>
                            <td>{r.status}</td>
                            <td>
                              {r.error ??
                                (r.record_count !== undefined ? `${r.record_count}건` : '—')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="아직 동기화 이력이 없습니다" />
                )}
              </section>
            </>
          )}
          {tab === 'overview' && (
            <section className="sources-strip">
              <div>
                <Link2 size={17} />
                <strong>함께 연결된 데이터</strong>
              </div>
              <div className="sources-pills">
                {(['oura', 'health_task', 'health_connect'] as Source[]).map((s) => (
                  <span key={s}>
                    <i
                      className={demo || connectionFor(s)?.status === 'connected' ? 'online' : ''}
                    />
                    {sourceNames[s]}
                  </span>
                ))}
                <button onClick={() => setTab('settings')} aria-label="연결 추가">
                  <Plus size={15} />
                </button>
              </div>
              <button className="text-button" onClick={() => setTab('settings')}>
                연결 관리 <ArrowRight size={14} />
              </button>
            </section>
          )}
          <footer>
            <span>
              오늘의 건강 <i>·</i> 매일의 기록이 만드는 나의 리듬
            </span>
            <span>
              <Clock size={12} />
              {latestAt ? `최근 측정 ${dayOf(latestAt)}` : '아직 수집된 기록이 없어요'}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function MetricCard({
  title,
  value,
  suffix,
  icon,
  source,
  note,
  color,
}: {
  title: string;
  value: string;
  suffix?: string;
  icon: React.ReactNode;
  source: string;
  note: string;
  color: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{title}</span>
        <span className={`metric-icon ${color}`}>{icon}</span>
      </div>
      <div className={`metric-value ${value.includes('시간') ? 'time-value' : ''}`}>
        {value}
        {suffix && <small>{suffix}</small>}
      </div>
      <div className="metric-note">
        <span>{note}</span>
      </div>
      <div className="metric-source">
        <span className="source-dot" />
        {source}
      </div>
    </article>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Activity size={24} />
      <p>{text}</p>
      <small>연결 · 설정에서 데이터 소스를 확인해 주세요.</small>
    </div>
  );
}
function Trend({
  records,
  lines,
  compact = false,
}: {
  records: HealthRecord[];
  lines: { key: string; color: string; name: string }[];
  compact?: boolean;
}) {
  const ordered = [...records].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const data: Record<string, string | number>[] = [];
  for (const r of ordered) {
    const values: Record<string, number> = {};
    for (const l of lines) {
      const v = valueFor(r, l.key);
      if (v !== null) values[l.key] = v;
    }
    if (Object.keys(values).length) {
      const date = dayOf(r.measured_at);
      const last = data.at(-1);
      if (
        last?.date === date &&
        !lines.some((l) => last[l.key] !== undefined && values[l.key] !== undefined)
      )
        Object.assign(last, values);
      else data.push({ date, label: date.slice(5).replace('-', '.'), ...values });
    }
  }
  if (!data.length) return <Empty text="선택한 기간에 측정된 기록이 없어요" />;
  return (
    <div
      className={`trend ${compact ? 'compact' : ''}`}
      role="img"
      aria-label={lines.map((l) => l.name).join(', ') + ' 추이 그래프'}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} margin={{ top: 12, right: compact ? 5 : 12, left: -25, bottom: 0 }}>
          <defs>
            {lines.map((l) => (
              <linearGradient
                id={`gradient-${l.key}-${compact}`}
                key={l.key}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={l.color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={l.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="#edf0ec" strokeDasharray="3 5" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            minTickGap={35}
            tick={{ fontSize: 11, fill: '#969b96' }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            domain={['auto', 'auto']}
            tick={{ fontSize: 11, fill: '#969b96' }}
          />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid #e6e9e3', fontSize: 12 }}
            labelFormatter={(_, payload) => String(payload[0]?.payload?.date ?? '')}
          />
          {lines.map((l) => (
            <Area
              key={l.key}
              type="linear"
              dataKey={l.key}
              name={l.name}
              stroke={l.color}
              strokeWidth={2.5}
              fill={`url(#gradient-${l.key}-${compact})`}
              dot={data.length < 3 ? { r: 4 } : false}
              activeDot={{ r: 4, stroke: 'white', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
