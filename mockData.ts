
import type { WorkerRecord, SafetyCheckRecord, HandwrittenAnswer } from './types';

// 예시 데이터 생성 함수 및 데이터 소스는 유지하되, 
// 실제 앱 실행 시에는 빈 배열을 반환하도록 설정합니다.
// 필요 시 테스트를 위해 이 파일의 mockWorkerRecords 배열을 채울 수 있습니다.

const jobFields = ['시스템', '용역', '철근', '분석', '배체정리', '형틀'];
const nationalities = ['베트남', '중국', '한국', '태국', '캄보디아', '몽골', '카자흐스탄'];

// Empty arrays to start fresh
export const mockWorkerRecords: WorkerRecord[] = [];
export const mockSafetyCheckRecords: SafetyCheckRecord[] = [];
