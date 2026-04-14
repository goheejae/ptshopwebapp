/**
 * js/pages/stats.js — 통계 페이지
 *
 * 역할: 상담지 데이터를 집계하여 방문 경로, 미등록 사유 등을 시각화합니다.
 *
 * 현재 상태: 구현 예정 (PRD.md 기능 5 참고)
 *   - 방문 경로 분류: sns | referral | walk-in | etc
 *   - 미등록 사유 분류: price | schedule | need_time | other
 *   - 데이터 원천: DB.consultsGet()의 visitPath · unregiReason 필드
 *
 * 사용법: import { renderStats } from './pages/stats.js';
 */

import { comingSoon } from '../utils.js';

/**
 * 통계 페이지를 #page-content에 그립니다.
 * 현재는 "구현 예정" 안내 화면만 표시합니다.
 */
export function renderStats() {
  comingSoon('📊', '통계', '방문 경로 · 미등록 사유 데이터 — 구현 예정');
}
