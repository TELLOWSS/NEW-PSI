# New Features Documentation

This document describes the three new features implemented in the NEW-PSI safety management system.

## 1. Psychological Analysis from Handwriting

### Overview
The `analyzeWorkerRiskAssessment` function has been enhanced to perform psychological analysis based on handwriting characteristics in the risk assessment forms.

### Features
- **Pen Pressure Analysis**: Analyzes stroke width and darkness to determine pressure level (1-10 scale)
  - 10: Very strong/pressed hard (thick, dark lines)
  - 5-6: Normal pressure
  - 1: Very weak/flowing lightly (thin, light lines)
  
- **Layout Violation Detection**: Detects if text goes outside defined boxes or boundaries
  - `true`: Text violates layout boundaries
  - `false`: Text stays within designated areas

### Implementation Details

#### Type Definition
```typescript
export interface PsychologicalAnalysis {
    pressureLevel: number; // 1-10 scale
    hasLayoutIssue: boolean; // Layout violation flag
}
```

#### Added to WorkerRecord
```typescript
export interface WorkerRecord {
    // ... existing fields ...
    psychologicalAnalysis?: PsychologicalAnalysis;
}
```

#### System Prompt Enhancement
The Gemini AI model now receives additional instructions to:
1. Analyze visual characteristics of handwriting
2. Infer pressure level from stroke characteristics
3. Check if text respects layout boundaries

### Usage
The psychological analysis data is automatically included in the WorkerRecord when analyzing risk assessment forms:

```typescript
const records = await analyzeWorkerRiskAssessment(imageData, mimeType, filename);
const analysis = records[0].psychologicalAnalysis;
console.log(`Pressure Level: ${analysis?.pressureLevel}/10`);
console.log(`Has Layout Issues: ${analysis?.hasLayoutIssue}`);
```

### Interpretation Guidelines
- **High Pressure (8-10)**: May indicate stress, tension, or strong commitment
- **Medium Pressure (4-7)**: Normal, balanced writing
- **Low Pressure (1-3)**: May indicate reluctance, fatigue, or hesitation
- **Layout Issues**: May indicate carelessness, lack of attention, or rushed completion

---

## 2. Traffic Light Badge Component

### Overview
A visual indicator component that uses traffic light colors to show review status based on confidence scores and risk levels.

### Color Logic

| Color | Condition | Meaning |
|-------|-----------|---------|
| 🔴 Red | `confidence < 0.7` OR `riskLevel == 'High'` | Review Required |
| 🟡 Yellow | `0.7 ≤ confidence < 0.9` | Check Needed |
| 🟢 Green | `confidence ≥ 0.9` AND `riskLevel != 'High'` | Pass |

### Features
- Circular traffic light style design
- Shows confidence percentage
- Click to force approve (one-way action)
- Parent notification via `onApprovalChange` callback
- Hover and focus states for accessibility

### Usage

```tsx
import { TrafficLightBadge } from './components/shared/TrafficLightBadge';

function MyComponent() {
    const handleApproval = (approved: boolean) => {
        console.log('Badge approved:', approved);
    };

    return (
        <TrafficLightBadge
            confidence={0.85}
            riskLevel="Medium"
            onApprovalChange={handleApproval}
        />
    );
}
```

### Props

```typescript
interface TrafficLightBadgeProps {
    confidence: number;           // 0-1 range
    riskLevel: RiskLevel;        // 'High' | 'Medium' | 'Low'
    onClick?: () => void;         // Optional click handler
    onApprovalChange?: (approved: boolean) => void; // Parent notification
}
```

### Design Notes
- Once clicked, the badge remains green (approved state)
- This is intentional to prevent accidental un-approval
- Parent components can track approval state via `onApprovalChange`
- Uses Tailwind CSS with static class names for JIT compatibility

---

## 3. Integrity Score Calculator

### Overview
Evaluates worker consistency by comparing written safety commitments against past violation history to detect potential false writing.

### How It Works
The function analyzes text for specific safety commitments and cross-references them with violation history:

1. **Safety Harness Check**: If text mentions "안전고리" or "안전대", check for fall-related violations
2. **Helmet Check**: If text mentions "안전모", check for helmet violations  
3. **PPE Check**: If text mentions "보호구", check for PPE violations
4. **General Check**: If text mentions general safety commitments, check total violation count

### Penalty System

| Violation Type | Max Penalty | Per Violation | Threshold |
|----------------|-------------|---------------|-----------|
| Fall/Harness | 40 points | 15 points | - |
| Helmet | 30 points | 12 points | - |
| PPE | 30 points | 10 points | - |
| General (High Count) | 25 points | 5 points | > 4 violations |

### Usage

```typescript
import { calculateIntegrityScore, formatIntegrityResult } from './utils/integrityUtils';

const text = '오늘의 다짐: 안전고리를 항상 착용하겠습니다.';
const history = [
    { type: '안전대 미착용', date: '2026-01-10', description: '...' },
    { type: '추락 위험', date: '2026-01-25', description: '...' }
];

const result = calculateIntegrityScore(text, history);
console.log(formatIntegrityResult(result));
```

### Types

```typescript
interface ViolationRecord {
    type: string;
    date: string;
    description?: string;
}

interface IntegrityResult {
    score: number;          // 0-100 scale
    isSuspicious: boolean;  // True if inconsistencies found
    warning: string;        // Warning message
    details: string[];      // Detailed explanation
}
```

### Interpretation

| Score Range | Status | Meaning |
|-------------|--------|---------|
| 0-39 | ⚠️ 심각 | Serious suspicion of false writing |
| 40-59 | ⚠️ 주의 | Possible inconsistency detected |
| 60-79 | ⚠️ 경고 | Minor inconsistency, monitoring needed |
| 80-99 | ✅ 주의 | Minor issues found |
| 100 | ✅ 우수 | No violations, consistent commitment |

### Example Output

```
언행일치 점수: 70/100
상태: ⚠️ 경고: 일관성 부족 - 과거 위반 이력 존재, 주의 깊은 모니터링 필요

상세 분석:
  - '안전고리' 언급했으나 과거 추락 위험 관련 위반 2건 발견
  - 신뢰도 감소: -30점
```

### Configuration
All penalty constants are defined at the top of `utils/integrityUtils.ts` and can be adjusted:

```typescript
const MAX_FALL_PENALTY = 40;
const FALL_PENALTY_PER_VIOLATION = 15;
const MAX_HELMET_PENALTY = 30;
const HELMET_PENALTY_PER_VIOLATION = 12;
// ... etc
```

---

## Testing

### Demo Files
Two demo files are included (in `.gitignore`):

1. **demo.ts**: TypeScript demonstrations of all three features
2. **traffic-light-demo.html**: Interactive HTML demo of the Traffic Light Badge

### Manual Testing
```bash
# Test integrity score
node test-integrity.js

# View traffic light demo in browser
open traffic-light-demo.html
```

### Integration Testing
The features integrate seamlessly with existing code:
- Psychological analysis is optional in WorkerRecord (backward compatible)
- Traffic Light Badge is a standalone component
- Integrity score is a pure utility function with no dependencies

---

## Security Considerations

All code has been reviewed with CodeQL and no security vulnerabilities were found:
- No SQL injection risks (no database queries)
- No XSS vulnerabilities (React handles escaping)
- No hardcoded secrets
- Type-safe TypeScript implementation
- Input validation in integrity calculator

---

## Future Enhancements

### Psychological Analysis
- Correlate pressure level with safety scores
- Track pressure trends over time
- Alert when unusual patterns detected

### Traffic Light Badge
- Add tooltip with detailed explanation
- Support custom color schemes
- Animation on state change
- Export approval history

### Integrity Score
- Machine learning to improve detection
- Support for more languages
- Historical trend analysis
- Configurable thresholds per site
- Integration with disciplinary action system

---

## Support

For questions or issues, please contact the development team or create an issue in the repository.
