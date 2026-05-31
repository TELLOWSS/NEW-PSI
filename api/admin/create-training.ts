/**
 * @deprecated 이 파일은 /api/admin/training (action: 'create') 으로 통합되었습니다.
 * Vercel 함수 카운트를 줄이기 위해 git에서 직접 제거하거나 배포 전 제외하세요.
 * 기존 클라이언트 호환성을 위해 요청을 통합 핸들러로 위임합니다.
 */
import trainingHandler from './training.js';

export default trainingHandler;
