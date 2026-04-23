# KPI 자동 수집 및 보고 가이드 (2026-04-23)

## 0) 목적
이 문서는 신뢰성 KPI 12개를 자동으로 수집하고 월간 보고서를 생성하는 운영 가이드입니다.

---

## 1) KPI 자동 수집 구조

### 1-1. 데이터 소스
| KPI 코드 | KPI 명칭 | 데이터 소스 | 수집 주기 | 자동화 난이도 |
| --- | --- | --- | --- | --- |
| REL_001 | strict8 PASS율 | `verify:release` 리포트 | 일일 | ⭐ (이미 있음) |
| REL_002 | 최대 편차 | score-consistency-strict8.md | 일일 | ⭐ (이미 있음) |
| REL_003 | 근거기록률 | scoreReasoning 필드 | 일일 | ⭐⭐ (필드 검사) |
| REL_004 | 설명가능율 | scoreReasoning 품질 체크 | 주간 | ⭐⭐⭐ (NLP 필요) |
| REL_005 | 감사로그율 | auditTrail 필드 | 일일 | ⭐⭐ (필드 검사) |
| REL_006 | 급변금지율 | 점수 변회 히스토리 | 일일 | ⭐⭐ (버전 비교) |
| REL_007 | 수동수정률 | manualOverride 플래그 | 일일 | ⭐ (플래그 집계) |
| REL_008 | 수정번복률 | override 히스토리 중복 | 주간 | ⭐⭐ (히스토리 분석) |
| REL_009 | 고위험조치율 | actionHistory + 점수 연계 | 주간 | ⭐⭐⭐ (규칙 엔진) |
| REL_010 | 합치도율 | 평가자 판정 데이터 | 월간 (수동) | ⭐⭐⭐⭐ (수집 필요) |
| REL_011 | verify:release PASS율 | CI/CD 파이프라인 로그 | 일일 | ⭐ (이미 있음) |
| REL_012 | 비용절감율 | backfill-readiness.json | 주간 | ⭐⭐ (분류별 계산) |

---

## 2) 자동 수집 스크립트 (Node.js 예시)

### 2-1. 일일 KPI 수집 (cron: 매일 자정)
```javascript
// scripts/auto-collect-daily-kpi.js
const fs = require('fs');
const path = require('path');

async function collectDailyKPIs() {
  const today = new Date().toISOString().split('T')[0];
  const reportDir = 'reports';
  
  const kpis = {};
  
  // REL_001: strict8 PASS율
  try {
    const strict8Report = JSON.parse(fs.readFileSync(
      path.join(reportDir, 'score-consistency-strict8.json'), 'utf8'
    ));
    kpis.REL_001 = (strict8Report.passCount / strict8Report.totalPairs * 100).toFixed(1);
    kpis.REL_002 = strict8Report.maxGap || 0;
  } catch (e) {
    console.warn('strict8 report not found');
  }
  
  // REL_003: 근거기록률 (scoreReasoning)
  try {
    const records = JSON.parse(fs.readFileSync(
      path.join(reportDir, 'records-export.json'), 'utf8'
    ));
    const recordArray = records.workerRecords || records;
    const withReasoning = recordArray.filter(r => r.scoreReasoning && r.scoreReasoning.length > 0);
    kpis.REL_003 = (withReasoning.length / recordArray.length * 100).toFixed(1);
  } catch (e) {
    console.warn('records export not found');
  }
  
  // REL_005: 감사로그율
  try {
    const withAudit = recordArray.filter(r => r.auditTrail && r.auditTrail.length > 0);
    const modified = recordArray.filter(r => r.modifiedAt && r.modifiedAt > r.createdAt);
    kpis.REL_005 = modified.length > 0 
      ? (withAudit.filter(r => modified.some(m => m.id === r.id)).length / modified.length * 100).toFixed(1)
      : 100;
  } catch (e) {
    console.warn('audit trail check failed');
  }
  
  // REL_007: 수동수정률
  try {
    const withOverride = recordArray.filter(r => r.manualOverride === true);
    kpis.REL_007 = (withOverride.length / recordArray.length * 100).toFixed(1);
  } catch (e) {
    console.warn('manual override check failed');
  }
  
  // REL_011, REL_012 는 별도 스크립트에서 수집
  
  // 저장
  const dailyKPI = {
    date: today,
    timestamp: new Date().toISOString(),
    ...kpis
  };
  
  fs.writeFileSync(
    path.join(reportDir, `kpi-daily-${today}.json`),
    JSON.stringify(dailyKPI, null, 2)
  );
  
  console.log(`✓ Daily KPI collected: ${today}`);
  return dailyKPI;
}

module.exports = { collectDailyKPIs };

// 실행: node scripts/auto-collect-daily-kpi.js
```

### 2-2. 주간 KPI 집계 (cron: 매주 월요일 오전 9시)
```javascript
// scripts/auto-collect-weekly-kpi.js
const fs = require('fs');
const path = require('path');

async function collectWeeklyKPIs() {
  const today = new Date();
  const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
  const weekStartStr = weekStart.toISOString().split('T')[0];
  
  const reportDir = 'reports';
  const dailyKPIs = [];
  
  // 지난 7일 KPI 파일 수집
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const file = path.join(reportDir, `kpi-daily-${dateStr}.json`);
    
    if (fs.existsSync(file)) {
      dailyKPIs.push(JSON.parse(fs.readFileSync(file, 'utf8')));
    }
  }
  
  if (dailyKPIs.length === 0) {
    console.warn('No daily KPI files found for this week');
    return;
  }
  
  // 평균 계산
  const weeklyKPI = { week: weekStartStr, days: dailyKPIs.length };
  const kpiCodes = Object.keys(dailyKPIs[0]).filter(k => k.startsWith('REL_'));
  
  for (const code of kpiCodes) {
    const values = dailyKPIs
      .map(d => parseFloat(d[code]))
      .filter(v => !isNaN(v));
    
    if (values.length > 0) {
      weeklyKPI[code] = (values.reduce((a, b) => a + b) / values.length).toFixed(1);
      weeklyKPI[`${code}_trend`] = values.length > 1 
        ? (values[values.length - 1] - values[0]).toFixed(1)
        : 0;
    }
  }
  
  // 저장
  fs.writeFileSync(
    path.join(reportDir, `kpi-weekly-${weekStartStr}.json`),
    JSON.stringify(weeklyKPI, null, 2)
  );
  
  console.log(`✓ Weekly KPI collected: week of ${weekStartStr}`);
  return weeklyKPI;
}

module.exports = { collectWeeklyKPIs };
```

### 2-3. 월간 KPI 보고서 생성 (cron: 매월 1일 오전 10시)
```javascript
// scripts/auto-generate-monthly-kpi-report.md.js
const fs = require('fs');
const path = require('path');

function generateMonthlyReport(year, month) {
  const reportDir = 'reports';
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  
  // 지난 달 주간 KPI 수집
  const weeklyFiles = fs.readdirSync(reportDir)
    .filter(f => f.startsWith('kpi-weekly-') && f.includes(monthStr));
  
  const weeklyKPIs = weeklyFiles.map(f => 
    JSON.parse(fs.readFileSync(path.join(reportDir, f), 'utf8'))
  );
  
  if (weeklyKPIs.length === 0) {
    console.warn(`No weekly KPI data for ${monthStr}`);
    return;
  }
  
  // 마크다운 생성
  let md = `# 월간 KPI 보고서 - ${monthStr}\n\n`;
  md += `생성일: ${new Date().toISOString()}\n\n`;
  
  // 월간 평균
  md += `## 월간 주요 지표\n\n`;
  md += `| KPI | 평균 | 추세 | 상태 |\n`;
  md += `| --- | ---: | ---: | --- |\n`;
  
  const kpiCodes = ['REL_001', 'REL_003', 'REL_005', 'REL_007', 'REL_012'];
  const kpiNames = {
    REL_001: 'strict8 PASS율',
    REL_003: '근거기록률',
    REL_005: '감사로그율',
    REL_007: '수동수정률',
    REL_012: '비용절감율'
  };
  
  for (const code of kpiCodes) {
    const values = weeklyKPIs
      .map(w => parseFloat(w[code]))
      .filter(v => !isNaN(v));
    
    if (values.length > 0) {
      const avg = (values.reduce((a, b) => a + b) / values.length).toFixed(1);
      const trend = values.length > 1 
        ? (values[values.length - 1] - values[0]).toFixed(1)
        : 0;
      const status = trend > 0 ? '📈 개선' : trend < 0 ? '📉 악화' : '➡️ 유지';
      
      md += `| ${kpiNames[code]} | ${avg}% | ${trend > 0 ? '+' : ''}${trend}%p | ${status} |\n`;
    }
  }
  
  // 주간 상세
  md += `\n## 주간 상세\n\n`;
  weeklyKPIs.forEach(w => {
    md += `### ${w.week} (${w.days}일)\n`;
    md += `- REL_001: ${w.REL_001}%\n`;
    md += `- REL_003: ${w.REL_003}%\n`;
    md += `- REL_005: ${w.REL_005}%\n`;
    md += `- REL_007: ${w.REL_007}%\n\n`;
  });
  
  // 저장
  fs.writeFileSync(
    path.join(reportDir, `kpi-report-${monthStr}.md`),
    md
  );
  
  console.log(`✓ Monthly KPI report generated: ${monthStr}`);
  return md;
}

module.exports = { generateMonthlyReport };

// 사용: generateMonthlyReport(2026, 4);
```

---

## 3) package.json 스크립트 추가

```json
{
  "scripts": {
    "kpi:collect-daily": "node scripts/auto-collect-daily-kpi.js",
    "kpi:collect-weekly": "node scripts/auto-collect-weekly-kpi.js",
    "kpi:generate-monthly": "node scripts/auto-generate-monthly-kpi-report.md.js",
    "kpi:all": "npm run kpi:collect-daily && npm run kpi:collect-weekly && npm run kpi:generate-monthly"
  }
}
```

---

## 4) 실행 명령

### 현재 운영 방식 (수동)
```bash
# 일일 KPI 수집
npm run kpi:collect-daily

# 주간 KPI 집계
npm run kpi:collect-weekly

# 월간 보고서 생성
npm run kpi:generate-monthly
```

### 자동화 방식 (CI/CD 통합)
```yaml
# .github/workflows/kpi-automation.yml
name: KPI Auto Collection

on:
  schedule:
    - cron: '0 0 * * *'      # 매일 자정: 일일 수집
    - cron: '0 9 * * 1'      # 매주 월 9시: 주간 집계
    - cron: '0 10 1 * *'     # 매월 1일 10시: 월간 보고

jobs:
  kpi-collection:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run kpi:all
      - uses: actions/upload-artifact@v3
        with:
          name: kpi-reports
          path: reports/kpi-*.json
```

---

## 5) 대시보드 연동 (선택)

### Google Sheets 연동
```javascript
// scripts/kpi-to-sheets.js
const { google } = require('googleapis');
const fs = require('fs');

async function pushKPIToSheets(sheetId, dataRange) {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json'
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  const kpiData = JSON.parse(fs.readFileSync('reports/kpi-latest.json'));
  
  const values = [
    [kpiData.date, kpiData.REL_001, kpiData.REL_005, kpiData.REL_007, kpiData.REL_012]
  ];
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: dataRange,
    valueInputOption: 'USER_ENTERED',
    resource: { values }
  });
  
  console.log('✓ KPI pushed to Google Sheets');
}
```

---

## 6) 모니터링 및 경보

### Slack 알림
```javascript
// scripts/kpi-slack-alert.js
const axios = require('axios');

async function checkAndAlert(webhookUrl) {
  const kpi = JSON.parse(fs.readFileSync('reports/kpi-daily-latest.json'));
  
  let alerts = [];
  
  // REL_001 PASS율 < 90%
  if (kpi.REL_001 < 90) {
    alerts.push(`⚠️ strict8 PASS율 ${kpi.REL_001}% (목표: 90%)`);
  }
  
  // REL_003 근거기록률 < 95%
  if (kpi.REL_003 < 95) {
    alerts.push(`⚠️ 근거기록률 ${kpi.REL_003}% (목표: 95%)`);
  }
  
  // REL_007 수동수정률 > 10%
  if (kpi.REL_007 > 10) {
    alerts.push(`⚠️ 수동수정률 ${kpi.REL_007}% (목표: ≤10%)`);
  }
  
  if (alerts.length > 0) {
    await axios.post(webhookUrl, {
      text: `🚨 KPI 경보 - ${new Date().toLocaleDateString('ko-KR')}\n${alerts.join('\n')}`
    });
  }
}
```

---

## 7) 운영 체크리스트

### 월간 5일까지
- [ ] 지난 달 일일 KPI 파일 10개 이상 확인
- [ ] 주간 KPI 파일 4개 확인
- [ ] 월간 보고서 자동 생성 완료
- [ ] Slack 알림 확인

### 월간 10일까지
- [ ] 경영진 보고용 1페이지 요약 작성
- [ ] 주요 편차 분석 및 원인 파악
- [ ] 다음 달 개선 조치 반영

### 월간 20일까지
- [ ] 평가자 합치도 수동 집계 (REL_010)
- [ ] KPI 대시보드 업데이트
- [ ] 실데이터 투입 시 수량 집계 (REL_012)

---

## 8) 연결 문서
- [METRIC_RULE_RELIABILITY_KPI_DASHBOARD_2026-04-23.md](METRIC_RULE_RELIABILITY_KPI_DASHBOARD_2026-04-23.md)
- [METRIC_RULE_EXTERNAL_PRESENTATION_ONEPAGE_2026-04-23.md](METRIC_RULE_EXTERNAL_PRESENTATION_ONEPAGE_2026-04-23.md)
