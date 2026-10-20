import { formatDuration, formatNumber, metric, num, type HealthRecord } from '@/lib/health';
export function SamsungRecords({ records }: { records: HealthRecord[] }) {
  const rows = records.filter(
    (r) => r.source === 'health_connect' && ['sleep', 'heart_rate'].includes(metric(r)),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>삼성 헬스 수면 · 심박</h2>
          <p>
            Health Connect 원본 측정 구간입니다. 수면 구간 길이는 실제 수면 시간과 다를 수 있어요.
          </p>
        </div>
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>측정 시작</th>
                <th>측정 종료</th>
                <th>항목</th>
                <th>기록</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r) => {
                const samples = r.data.samples as
                  { time: string; beatsPerMinute: number }[] | undefined;
                return (
                  <tr key={r.external_id}>
                    <td>
                      {new Date(String(r.data.startTime ?? r.measured_at)).toLocaleString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                      })}
                    </td>
                    <td>
                      {r.data.endTime
                        ? new Date(String(r.data.endTime)).toLocaleString('ko-KR', {
                            timeZone: 'Asia/Seoul',
                          })
                        : '—'}
                    </td>
                    <td>{metric(r) === 'sleep' ? '수면 구간' : '심박'}</td>
                    <td>
                      {metric(r) === 'sleep' ? (
                        formatDuration(
                          num(r.data.value) === null ? null : Number(r.data.value) * 1000,
                        )
                      ) : samples?.length ? (
                        <details>
                          <summary>{formatNumber(samples.length)}개 측정</summary>
                          <div className="sample-list">
                            {samples.slice(0, 200).map((s, i) => (
                              <p key={i}>
                                {new Date(s.time).toLocaleTimeString('ko-KR', {
                                  timeZone: 'Asia/Seoul',
                                })}{' '}
                                · {s.beatsPerMinute} bpm
                              </p>
                            ))}
                            {samples.length > 200 && <p>최근 원본 중 200개를 표시합니다.</p>}
                          </div>
                        </details>
                      ) : r.data.detailPartCount ? (
                        '상세 원본 분할 저장됨'
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p>수집된 삼성 헬스 수면·심박 기록이 없어요.</p>
          <small>오늘러닝 앱에서 읽기 권한을 허용하고 동기화해 주세요.</small>
        </div>
      )}
    </section>
  );
}
