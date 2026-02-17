/**
 * Test file for integrityUtils
 * Run with: node --loader ts-node/esm testIntegrityUtils.ts
 * Or via browser console for quick testing
 */

import { calculateIntegrityScore, formatIntegrityResult, ViolationRecord } from '../utils/integrityUtils';

console.log('=== Testing Integrity Utils ===\n');

// Test 1: Worker with no violations - should get perfect score
const test1: ViolationRecord[] = [];
const result1 = calculateIntegrityScore('저는 안전고리를 착용하겠습니다.', test1);
console.log('Test 1: No violations');
console.log('Expected: score=100, no warning');
console.log('Result:', result1);
console.log('Formatted:\n', formatIntegrityResult(result1));
console.log('\n---\n');

// Test 2: Worker with fall violations but writes about fall safety - inconsistency!
const test2: ViolationRecord[] = [
    {
        type: 'fall',
        date: '2024-01-15',
        description: '안전고리 미착용',
        severity: 'high'
    },
    {
        type: 'fall',
        date: '2024-02-20',
        description: '추락 방지 조치 미실시',
        severity: 'high'
    }
];
const result2 = calculateIntegrityScore('저는 항상 안전고리를 착용하고 있습니다. 추락 위험을 잘 알고 있습니다.', test2);
console.log('Test 2: Multiple fall violations but writes about fall safety');
console.log('Expected: low score, warning about potential false writing');
console.log('Result:', result2);
console.log('Formatted:\n', formatIntegrityResult(result2));
console.log('\n---\n');

// Test 3: Worker with medium severity violations
const test3: ViolationRecord[] = [
    {
        type: 'struck_by',
        date: '2024-03-10',
        description: '보호구 미착용',
        severity: 'medium'
    }
];
const result3 = calculateIntegrityScore('협착 사고 방지를 위해 보호구를 착용하겠습니다.', test3);
console.log('Test 3: Medium severity violation, mentions topic');
console.log('Expected: moderate score deduction');
console.log('Result:', result3);
console.log('Formatted:\n', formatIntegrityResult(result3));
console.log('\n---\n');

// Test 4: Generic/template responses
const test4: ViolationRecord[] = [];
const result4 = calculateIntegrityScore('안전수칙 준수하겠습니다. 안전제일. 조심하겠습니다.', test4);
console.log('Test 4: Generic template responses');
console.log('Expected: slight score deduction for lack of specificity');
console.log('Result:', result4);
console.log('Formatted:\n', formatIntegrityResult(result4));
console.log('\n---\n');

// Test 5: Empty text
const test5: ViolationRecord[] = [];
const result5 = calculateIntegrityScore('', test5);
console.log('Test 5: Empty text');
console.log('Expected: score=0, error message');
console.log('Result:', result5);
console.log('Formatted:\n', formatIntegrityResult(result5));
console.log('\n---\n');

// Test 6: Worker with electrocution violation writing about electrical safety
const test6: ViolationRecord[] = [
    {
        type: 'electrocution',
        date: '2024-04-05',
        description: '전기 작업 중 절연 장갑 미착용',
        severity: 'high'
    }
];
const result6 = calculateIntegrityScore('감전 방지를 위해 접지를 확인하고 작업하겠습니다.', test6);
console.log('Test 6: Electrocution violation but writes about electrical safety');
console.log('Expected: moderate to low score with warning');
console.log('Result:', result6);
console.log('Formatted:\n', formatIntegrityResult(result6));
console.log('\n===\n');

console.log('All tests completed!');
